import httpx
from fastapi import APIRouter, HTTPException

from app.resolution.resolve import resolve_case_entities

router = APIRouter(prefix="/resolve", tags=["resolution"])


@router.post("/cases/{case_id}")
def resolve_case(case_id: str):
    try:
        return resolve_case_entities(case_id)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Backend call failed: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
