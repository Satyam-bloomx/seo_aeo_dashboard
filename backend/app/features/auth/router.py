from fastapi import APIRouter

router = APIRouter()

@router.post("/login")
async def login():
    # Placeholder for auth logic
    return {"token": "fake-jwt-token"}
