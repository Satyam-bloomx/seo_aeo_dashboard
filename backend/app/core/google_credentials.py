"""Safe handling of user-supplied Google service-account JSON."""
import asyncio
from typing import Any, Dict, Optional, Sequence

from google.oauth2 import service_account
from google.auth.transport.requests import Request as GoogleRequest

GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
REFRESH_TIMEOUT_SECONDS = 15


class InvalidServiceAccountError(ValueError):
    pass


def safe_service_account_credentials(info: Dict[str, Any], scopes: Optional[Sequence[str]] = None, **kwargs):
    """Build credentials only for genuine Google service-account JSON.

    google-auth POSTs a signed assertion to the JSON's ``token_uri`` and echoes the response in
    errors, so an attacker-chosen token_uri is an SSRF primitive. We pin it to Google's endpoint.
    """
    if not isinstance(info, dict) or info.get("type") != "service_account":
        raise InvalidServiceAccountError("Not a Google service-account key file")
    for required in ("client_email", "private_key"):
        if not info.get(required):
            raise InvalidServiceAccountError(f"Service-account JSON is missing '{required}'")
    if info.get("token_uri", GOOGLE_TOKEN_URI) != GOOGLE_TOKEN_URI:
        raise InvalidServiceAccountError("Service-account token_uri must be Google's OAuth endpoint")
    if info.get("universe_domain", "googleapis.com") != "googleapis.com":
        raise InvalidServiceAccountError("Unsupported service-account universe_domain")
    clean = {**info, "token_uri": GOOGLE_TOKEN_URI}
    return service_account.Credentials.from_service_account_info(clean, scopes=scopes, **kwargs)


async def refresh_credentials(creds) -> None:
    """Refresh google-auth credentials without blocking the event loop."""
    await asyncio.wait_for(asyncio.to_thread(creds.refresh, GoogleRequest()), timeout=REFRESH_TIMEOUT_SECONDS)
