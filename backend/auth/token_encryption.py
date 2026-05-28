"""
RxHarden Phase 3 Task 2: Fernet-based symmetric encryption for Google refresh tokens.

Uses HKDF to derive a Fernet key from the application SECRET_KEY.
This ensures refresh tokens are encrypted at rest in the database.
"""
import base64
import logging
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from config import settings

logger = logging.getLogger(__name__)

# Derive a stable Fernet key from SECRET_KEY via HKDF
_HKDF_INFO = b"notebookrx-refresh-token-encryption-v1"
_HKDF_SALT = b"notebookrx-static-salt-v1"  # Static salt is acceptable here since SECRET_KEY is already high-entropy


def _derive_fernet_key() -> bytes:
    """Derive a 32-byte Fernet key from the application SECRET_KEY using HKDF."""
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_HKDF_SALT,
        info=_HKDF_INFO,
    )
    derived = hkdf.derive(settings.SECRET_KEY.encode("utf-8"))
    return base64.urlsafe_b64encode(derived)


# Lazy singleton — derived once on first use
_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_derive_fernet_key())
    return _fernet


def encrypt_token(plaintext: str) -> str:
    """Encrypt a plaintext token. Returns a Fernet ciphertext string (URL-safe base64)."""
    if not plaintext:
        return plaintext
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a Fernet-encrypted token. Returns the original plaintext string."""
    if not ciphertext:
        return ciphertext
    try:
        return _get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # Token was stored before encryption was enabled (plaintext legacy)
        # or the SECRET_KEY changed. Log and return as-is for graceful degradation.
        logger.warning("decrypt_token: InvalidToken — returning ciphertext as-is (possible legacy plaintext)")
        return ciphertext
