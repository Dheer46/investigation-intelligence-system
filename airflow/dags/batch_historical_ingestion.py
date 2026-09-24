"""Scheduled/historical batch ingestion (spec section 2 & recommended build
sequence, Phase 9): scans a drop folder for bulk FIR/CDR/financial/OSINT
files and pushes each one through the same NestJS upload API a human would
use in the UI - so it gets identical validation, hashing, MinIO storage, and
Kafka document-uploaded event as any other upload. This is the "historical
file batches" ingestion path called for alongside the real-time Kafka path.

Files are named `<CASE_NUMBER>__<SOURCE_TYPE>__<original name>` so the DAG
knows which case/source type to file them under without a separate manifest.
Example: `FIR-2026-0002__CDR__january_calls.csv`.
"""

from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime, timedelta

import requests
from airflow import DAG
from airflow.operators.python import PythonOperator

logger = logging.getLogger(__name__)

BACKEND_URL = os.environ.get("IIS_BACKEND_URL", "http://backend:3000")
SERVICE_EMAIL = os.environ.get("IIS_SERVICE_ACCOUNT_EMAIL", "investigator@iis.local")
SERVICE_PASSWORD = os.environ.get("IIS_SERVICE_ACCOUNT_PASSWORD", "Investigator@123")
INCOMING_DIR = "/opt/airflow/data/incoming"
PROCESSED_DIR = "/opt/airflow/data/processed"
FAILED_DIR = "/opt/airflow/data/failed"

VALID_SOURCE_TYPES = {"FIR", "INTELLIGENCE_REPORT", "CDR", "FINANCIAL_TRANSACTION", "OSINT", "OTHER"}

MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".json": "application/json",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


def _login() -> str:
    response = requests.post(
        f"{BACKEND_URL}/api/auth/login",
        json={"email": SERVICE_EMAIL, "password": SERVICE_PASSWORD},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()["accessToken"]


def _resolve_case_id(token: str, case_number: str) -> str | None:
    response = requests.get(
        f"{BACKEND_URL}/api/cases", headers={"Authorization": f"Bearer {token}"}, timeout=15
    )
    response.raise_for_status()
    for case in response.json():
        if case["caseNumber"] == case_number:
            return case["id"]
    return None


def scan_and_ingest(**_context) -> dict:
    os.makedirs(INCOMING_DIR, exist_ok=True)
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    os.makedirs(FAILED_DIR, exist_ok=True)

    filenames = [f for f in os.listdir(INCOMING_DIR) if os.path.isfile(os.path.join(INCOMING_DIR, f))]
    if not filenames:
        logger.info("No files waiting in %s", INCOMING_DIR)
        return {"ingested": 0, "failed": 0}

    token = _login()
    case_id_cache: dict[str, str | None] = {}
    ingested, failed = 0, 0

    for filename in filenames:
        path = os.path.join(INCOMING_DIR, filename)
        try:
            case_number, source_type, original_name = filename.split("__", 2)
        except ValueError:
            logger.warning("Skipping %s - expected CASE__SOURCE_TYPE__name.ext", filename)
            shutil.move(path, os.path.join(FAILED_DIR, filename))
            failed += 1
            continue

        if source_type not in VALID_SOURCE_TYPES:
            logger.warning("Skipping %s - unknown source type %s", filename, source_type)
            shutil.move(path, os.path.join(FAILED_DIR, filename))
            failed += 1
            continue

        if case_number not in case_id_cache:
            case_id_cache[case_number] = _resolve_case_id(token, case_number)
        case_id = case_id_cache[case_number]
        if not case_id:
            logger.warning("Skipping %s - no case found with number %s", filename, case_number)
            shutil.move(path, os.path.join(FAILED_DIR, filename))
            failed += 1
            continue

        ext = os.path.splitext(original_name)[1].lower()
        mime_type = MIME_TYPES.get(ext, "application/octet-stream")

        with open(path, "rb") as fh:
            response = requests.post(
                f"{BACKEND_URL}/api/cases/{case_id}/documents",
                headers={"Authorization": f"Bearer {token}"},
                data={"sourceType": source_type},
                files={"file": (original_name, fh, mime_type)},
                timeout=60,
            )

        if response.status_code == 201:
            shutil.move(path, os.path.join(PROCESSED_DIR, filename))
            ingested += 1
            logger.info("Ingested %s into case %s (%s)", original_name, case_number, source_type)
        else:
            logger.error("Upload failed for %s: %s %s", filename, response.status_code, response.text)
            shutil.move(path, os.path.join(FAILED_DIR, filename))
            failed += 1

    return {"ingested": ingested, "failed": failed}


default_args = {
    "owner": "iis-platform",
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    dag_id="batch_historical_ingestion",
    description="Scans a drop folder for bulk FIR/CDR/financial/OSINT files and ingests each via the backend upload API",
    default_args=default_args,
    schedule=timedelta(hours=1),
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["ingestion", "phase9"],
) as dag:
    PythonOperator(
        task_id="scan_and_ingest",
        python_callable=scan_and_ingest,
    )
