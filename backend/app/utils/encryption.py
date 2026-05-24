import base64
from cryptography.fernet import Fernet
from app.config import settings


def _get_fernet() -> Fernet:
    key = settings.FERNET_KEY
    if not key:
        raise RuntimeError("FERNET_KEY not configured")
    # Accept raw base64 key or plain string
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        # Derive a valid Fernet key from the string
        import hashlib
        derived = base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest())
        return Fernet(derived)


def encrypt_token(token: str) -> str:
    f = _get_fernet()
    return f.encrypt(token.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    f = _get_fernet()
    return f.decrypt(encrypted.encode()).decode()


def generate_fernet_key() -> str:
    return Fernet.generate_key().decode()
