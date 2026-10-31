import base64
import hashlib
import logging
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.core.config import IS_PRODUCTION

logger = logging.getLogger("security")

# Development-only key so local databases keep working without configuration.
# Production refuses to start without ENCRYPTION_KEY (see _load_cipher).
_DEV_FALLBACK_SECRET = "seo-audit-enterprise-deterministic-encryption-salt-v1"


def _fernet_for(secret: str) -> Fernet:
    # Accept either a native Fernet key or any passphrase (stretched to 32 bytes).
    try:
        return Fernet(secret.encode("utf-8"))
    except (ValueError, TypeError):
        return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest()))


def _load_cipher() -> MultiFernet:
    """ENCRYPTION_KEY encrypts new values. ENCRYPTION_KEYS_PREVIOUS (comma-separated) still decrypt,
    which allows key rotation without downtime."""
    primary = (os.getenv("ENCRYPTION_KEY") or "").strip()
    if not primary:
        if IS_PRODUCTION:
            raise RuntimeError("ENCRYPTION_KEY must be set in production to encrypt stored credentials.")
        logger.warning("ENCRYPTION_KEY is not set; using the insecure development key.")
        primary = _DEV_FALLBACK_SECRET
    previous = [k.strip() for k in (os.getenv("ENCRYPTION_KEYS_PREVIOUS") or "").split(",") if k.strip()]
    if not IS_PRODUCTION and primary != _DEV_FALLBACK_SECRET:
        previous.append(_DEV_FALLBACK_SECRET)
    return MultiFernet([_fernet_for(primary), *(_fernet_for(k) for k in previous)])


_CIPHER = _load_cipher()
_ENCRYPTED_PREFIX = "enc::"


def encrypt_secret(val: Optional[str]) -> Optional[str]:
    """Encrypt a credential (API key, OAuth token). Never silently falls back to plaintext."""
    if not val or not isinstance(val, str):
        return val
    val_clean = val.strip()
    if not val_clean or val_clean.startswith(_ENCRYPTED_PREFIX):
        return val_clean
    return f"{_ENCRYPTED_PREFIX}{_CIPHER.encrypt(val_clean.encode('utf-8')).decode('utf-8')}"


def decrypt_secret(val: Optional[str]) -> Optional[str]:
    """Decrypt a credential. Legacy plaintext values are returned as-is (re-encrypted on next write);
    values that cannot be decrypted return None rather than leaking ciphertext as a credential."""
    if not val or not isinstance(val, str):
        return val
    if not val.startswith(_ENCRYPTED_PREFIX):
        return val
    try:
        return _CIPHER.decrypt(val[len(_ENCRYPTED_PREFIX):].encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.error("Stored credential could not be decrypted (wrong or rotated ENCRYPTION_KEY).")
        return None


def mask_key(key: Optional[str]) -> str:
    """Mask a credential for display: never reveals more than the last 4 characters."""
    if not key:
        return ""
    decrypted = decrypt_secret(key)
    if not decrypted or len(decrypted) <= 12:
        return "••••••••"
    return f"••••••••{decrypted[-4:]}"
