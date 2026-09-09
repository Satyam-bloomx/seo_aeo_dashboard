from fastapi import APIRouter
from app.features.audits.service import run_full_audit

router = APIRouter()

@router.post("/")
async def start_audit(url: str):
    # Synchronously awaited for now (in production this would be sent to Celery)
    result = await run_full_audit(url)
    return result

@router.get("/{audit_id}")
async def get_audit_result(audit_id: str):
    # Fetch results from Postgres (JSONB)
    return {"audit_id": audit_id, "status": "completed", "data": {}}
