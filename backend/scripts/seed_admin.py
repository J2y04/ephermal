"""
Create the admin user account.

Run from the backend/ directory:
    python -m scripts.seed_admin

Requires a running PostgreSQL database and a valid .env file.
"""
import asyncio
import sys
import os

# Allow running as `python -m scripts.seed_admin` from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.utils.security import hash_password

ADMIN_EMAIL = "admin@ephermal.app"
ADMIN_PASSWORD = "onepiece"
ADMIN_NAME = "Admin"


async def seed():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        existing = result.scalar_one_or_none()

        if existing:
            # Update password in case it changed
            existing.hashed_password = hash_password(ADMIN_PASSWORD)
            existing.is_verified = True
            existing.is_active = True
            await db.commit()
            print(f"[seed_admin] Admin account already exists — password reset.")
        else:
            user = User(
                email=ADMIN_EMAIL,
                hashed_password=hash_password(ADMIN_PASSWORD),
                full_name=ADMIN_NAME,
                is_verified=True,
                is_active=True,
            )
            db.add(user)
            await db.commit()
            print(f"[seed_admin] Admin account created.")

        print(f"  email    : {ADMIN_EMAIL}")
        print(f"  password : {ADMIN_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
