import urllib.parse
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.database import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RefreshRequest, UserOut, UpdateProfileRequest, ChangePasswordRequest
from app.utils.security import hash_password, verify_password, create_access_token, create_refresh_token, verify_token
from app.config import settings
from app.routers.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        is_verified=False,
    )
    db.add(user)
    await db.flush()

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("20/hour")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    user_id = verify_token(body.refresh_token, "refresh")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.full_name is not None:
        user.full_name = body.full_name.strip() or None
    from app.models.billing import CreditTransaction
    balance_result = await db.execute(
        select(func.coalesce(func.sum(CreditTransaction.amount), 0))
        .where(CreditTransaction.user_id == user.id)
    )
    balance = int(balance_result.scalar() or 0)
    return UserOut(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        is_verified=user.is_verified,
        credit_balance=balance,
    )


@router.post("/change-password", status_code=204)
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
):
    if not user.hashed_password:
        raise HTTPException(status_code=400, detail="Password login not available for Google sign-in accounts")
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.hashed_password = hash_password(body.new_password)


@router.get("/google")
async def google_login():
    state = create_oauth_state("login")
    params = urllib.parse.urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "state": state,
    })
    return {"url": f"https://accounts.google.com/o/oauth2/v2/auth?{params}"}


@router.get("/google/callback")
async def google_callback(code: str, state: str | None = None, db: AsyncSession = Depends(get_db)):
    if not state or not verify_oauth_state(state):
        return RedirectResponse(url=f"{settings.APP_URL}/auth/login.html?error=google_auth_failed")
    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(GOOGLE_TOKEN_URL, data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            })
            token_resp.raise_for_status()
            tokens = token_resp.json()

            info_resp = await client.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {tokens['access_token']}"})
            info_resp.raise_for_status()
            info = info_resp.json()
    except Exception:
        return RedirectResponse(url=f"{settings.APP_URL}/auth/login.html?error=google_auth_failed")

    google_id = info["sub"]
    email = info["email"]

    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        result2 = await db.execute(select(User).where(User.email == email))
        user = result2.scalar_one_or_none()

    if not user:
        user = User(
            email=email,
            google_id=google_id,
            full_name=info.get("name"),
            avatar_url=info.get("picture"),
            is_verified=True,
        )
        db.add(user)
        await db.flush()
    elif not user.google_id:
        user.google_id = google_id
        user.is_verified = True

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    return RedirectResponse(
        url=f"{settings.APP_URL}/auth/oauth-callback.html?access_token={access_token}&refresh_token={refresh_token}"
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.billing import CreditTransaction
    balance_result = await db.execute(
        select(func.coalesce(func.sum(CreditTransaction.amount), 0))
        .where(CreditTransaction.user_id == user.id)
    )
    balance = int(balance_result.scalar() or 0)
    return UserOut(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        is_verified=user.is_verified,
        credit_balance=balance,
    )
