import os
import time
import logging
from typing import Optional
from pydantic import BaseModel
from fastapi import Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
import jwt
from jwt import PyJWKClient

logger = logging.getLogger("auth")

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
# Legacy Supabase projects sign access tokens with a shared HS256 secret instead of JWKS.
SUPABASE_JWT_SECRET = (os.getenv("SUPABASE_JWT_SECRET") or "").strip()

jwks_client: Optional[PyJWKClient] = None
if SUPABASE_URL:
    try:
        jwks_client = PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True, max_cached_keys=10)
    except Exception as e:
        logger.warning("Could not initialize PyJWKClient: %s", e)
if not jwks_client and not SUPABASE_JWT_SECRET:
    logger.error("Neither SUPABASE_URL nor SUPABASE_JWT_SECRET is configured: every authenticated request will be rejected.")

MAX_SESSION_AGE_SECONDS = 3 * 24 * 3600  # 3 days
# Tolerate small clock drift between this server and Supabase; without it, fresh tokens fail the iat check.
JWT_LEEWAY_SECONDS = 30


class UserSession(BaseModel):
    id: str
    email: Optional[str] = None
    role: Optional[str] = "authenticated"
    is_anonymous: bool = False


def _verify_signature(token: str) -> dict:
    """Verify a Supabase access token. Tokens whose signature cannot be verified are always rejected."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    alg = header.get("alg")
    decode_opts = {"require": ["exp", "sub"]}
    try:
        if alg == "HS256":
            if not SUPABASE_JWT_SECRET:
                raise HTTPException(status_code=401, detail="Invalid authentication credentials")
            return jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated", options=decode_opts, leeway=JWT_LEEWAY_SECONDS)
        if alg in ("ES256", "RS256") and jwks_client:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            return jwt.decode(token, signing_key.key, algorithms=[alg], audience="authenticated", options=decode_opts, leeway=JWT_LEEWAY_SECONDS)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    except jwt.PyJWKClientError:
        logger.warning("JWKS unavailable while verifying token")
        raise HTTPException(status_code=503, detail="Authentication service temporarily unavailable")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    raise HTTPException(status_code=401, detail="Invalid authentication credentials")


def decode_supabase_jwt(token: str) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    scheme, _, credentials = token.strip().partition(" ")
    clean_token = credentials.strip() if scheme.lower() == "bearer" else token.strip()
    if not clean_token:
        raise HTTPException(status_code=401, detail="Missing authentication token")

    payload = _verify_signature(clean_token)

    # Enforce the 3-day maximum session age from the original sign-in.
    auth_ts = payload.get("auth_time") or payload.get("iat")
    if auth_ts is not None:
        try:
            if int(time.time()) - int(auth_ts) > MAX_SESSION_AGE_SECONDS:
                raise HTTPException(
                    status_code=401,
                    detail="Session expired: Maximum session duration is 3 days. For your security, please sign in again.",
                )
        except (ValueError, TypeError):
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    return payload


def _session_from_payload(payload: dict) -> UserSession:
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload: missing user ID")
    return UserSession(
        id=str(user_id),
        email=payload.get("email"),
        role=payload.get("role", "authenticated"),
        is_anonymous=bool(payload.get("is_anonymous", False)),
    )


async def get_current_user(authorization: Optional[str] = Header(None)) -> UserSession:
    """FastAPI dependency: the verified current user, or 401."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    return _session_from_payload(decode_supabase_jwt(authorization))


async def get_user_project_id(db: AsyncSession, user: UserSession) -> int:
    return await get_or_create_user_project(db, user.id)


async def get_or_create_user_project(db: AsyncSession, user_id: str, default_name: str = "My Workspace") -> int:
    """Return the isolated workspace project owned by user_id, creating it on first use."""
    from app.models.domain import Project

    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")

    stmt = select(Project.id).where(Project.user_id == user_id).order_by(Project.id.asc()).limit(1)
    project_id = (await db.execute(stmt)).scalar()
    if project_id is not None:
        return project_id

    proj = Project(name=default_name, user_id=user_id)
    db.add(proj)
    try:
        await db.commit()
    except IntegrityError:
        # A concurrent first request created the workspace; use that one.
        await db.rollback()
        project_id = (await db.execute(stmt)).scalar()
        if project_id is None:
            raise
        return project_id
    await db.refresh(proj)
    return proj.id
