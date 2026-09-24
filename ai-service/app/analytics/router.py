import httpx
from fastapi import APIRouter, HTTPException

from app.analytics.centrality import get_top_connectors
from app.analytics.orchestrator import run_case_analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post("/cases/{case_id}/run")
def run_analytics(case_id: str):
    try:
        return run_case_analytics(case_id)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Backend call failed: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/cases/{case_id}/top-connectors")
def top_connectors(case_id: str, limit: int = 10):
    try:
        return get_top_connectors(case_id, limit)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
