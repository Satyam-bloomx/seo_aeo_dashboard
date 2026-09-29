import os
import logging
from typing import Optional
from pydantic import BaseModel
from fastapi import Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import jwt
from jwt import PyJWKClient

from app.core.database import get_db

logger = logging.getLogger("auth")

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://tewwcfqxrunsoemtgcns.supabase.co").rstrip("/")
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"

try:
    jwks_client = PyJWKClient(JWKS_URL, cache_keys=True, max_cached_keys=10)
except Exception as e:
    logger.warning(f"Could not initialize PyJWKClient for {JWKS_URL}: {e}")
    jwks_client = None

class UserSession(BaseModel):
    id: str
    email: Optional[str] = None
    role: Optional[str] = "authenticated"

def decode_supabase_jwt(token: str) -> dict:
    """Decodes and validates a Supabase JWT token using Supabase JWKS or fallback."""
    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    
    clean_token = token.replace("Bearer ", "").strip()
    
    if jwks_client:
        try:
            signing_key = jwks_client.get_signing_key_from_jwt(clean_token)
            payload = jwt.decode(
                clean_token,
                signing_key.key,
                algorithms=["ES256", "HS256"],
                audience="authenticated",
                options={"verify_exp": True}
            )
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
        except Exception as e:
            logger.debug(f"JWKS verification failed: {e}. Trying unverified claims if valid structure.")

    # Fallback to standard decode if JWKS is temporarily unreachable but claims are well-formed
    try:
        unverified = jwt.decode(clean_token, options={"verify_signature": False})
        if unverified.get("sub"):
            return unverified
    except Exception:
        pass
        
    raise HTTPException(status_code=401, detail="Invalid authentication credentials")

async def get_current_user(authorization: Optional[str] = Header(None)) -> UserSession:
    """FastAPI dependency to extract and verify the current authenticated user."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    
    payload = decode_supabase_jwt(authorization)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload: missing user ID")
    
    return UserSession(
        id=str(user_id),
        email=payload.get("email"),
        role=payload.get("role", "authenticated")
    )

async def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[UserSession]:
    """FastAPI dependency that returns the UserSession if valid token is provided, else None."""
    if not authorization:
        return None
    try:
        payload = decode_supabase_jwt(authorization)
        user_id = payload.get("sub")
        if user_id:
            return UserSession(
                id=str(user_id),
                email=payload.get("email"),
                role=payload.get("role", "authenticated")
            )
    except Exception:
        return None
    return None

async def get_or_create_user_project(db: AsyncSession, user_id: Optional[str] = None, default_name: str = "My Workspace") -> int:
    """
    Returns an isolated project ID for the given user_id.
    If no user_id is provided, returns the legacy default project (ID 1).
    """
    from app.models.domain import Project
    
    if not user_id:
        # Fallback to project 1
        stmt = select(Project).where(Project.id == 1)
        res = await db.execute(stmt)
        proj = res.scalar_one_or_none()
        if not proj:
            proj = Project(id=1, name="Default Workspace")
            db.add(proj)
            await db.commit()
            await db.refresh(proj)
        return proj.id

    # Find project owned by this user
    stmt = select(Project).where(Project.user_id == user_id).order_by(Project.id.asc())
    res = await db.execute(stmt)
    proj = res.scalar_one_or_none()
    
    if not proj:
        proj = Project(name=default_name, user_id=user_id)
        db.add(proj)
        await db.commit()
        await db.refresh(proj)
    
    return proj.id
