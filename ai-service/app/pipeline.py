"""Processing MVP orchestrator: Raw File/Event -> Type Detection ->
Extraction/OCR -> Clean + Normalize -> NLP entities -> Relationship extraction
-> POST results to the NestJS backend (the system of record for Postgres).
"""

import logging

import httpx
import psycopg2

from app.common.schemas import ExtractedEntityPayload, ExtractedRelationPayload, ExtractionResultPayload
from app.config import settings
from app.deps import get_minio_client
from app.extraction.extract import extract_text_units
from app.nlp.entity_extraction import extract_entities
from app.nlp.gemini_extraction import extract_with_gemini, needs_multilingual_extraction
from app.relationships.relation_extraction import extract_relations

logger = logging.getLogger("ai-service.pipeline")


def _set_document_status(document_id: str, status: str) -> None:
    conn = psycopg2.connect(settings.postgres_dsn, connect_timeout=5)
    try:
        with conn, conn.cursor() as cur:
            cur.execute('UPDATE documents SET status = %s WHERE id = %s', (status, document_id))
    finally:
        conn.close()


def _download_document(bucket: str, key: str) -> bytes:
    client = get_minio_client()
    response = client.get_object(bucket, key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def _post_results(document_id: str, entities: list[ExtractedEntityPayload], relations: list[ExtractedRelationPayload]) -> None:
    payload = ExtractionResultPayload(entities=entities, relations=relations)
    url = f"{settings.backend_internal_url}/api/internal/documents/{document_id}/extraction-results"
    headers = {"x-internal-key": settings.internal_service_key}
    response = httpx.post(url, content=payload.model_dump_json(), headers={**headers, "Content-Type": "application/json"}, timeout=30)
    response.raise_for_status()


def process_document(event: dict) -> None:
    document_id = event["documentId"]
    storage_bucket = event["storageBucket"]
    storage_key = event["storageKey"]
    mime_type = event["mimeType"]

    _set_document_status(document_id, "PROCESSING")
    try:
        content = _download_document(storage_bucket, storage_key)
        units = extract_text_units(mime_type, content)

        entities: list[ExtractedEntityPayload] = []
        relations: list[ExtractedRelationPayload] = []
        for unit in units:
            # spaCy's dependency parser and NER model are English-only - on a
            # unit written mostly in Hindi/a regional language they'd produce
            # noise rather than a graceful partial result, so that unit's
            # entities AND relations both come from Gemini instead, not on
            # top of the English pipeline.
            if settings.enable_multilingual_nlp and needs_multilingual_extraction(unit.text):
                gemini_entities, gemini_relations = extract_with_gemini(unit)
                entities.extend(gemini_entities)
                relations.extend(gemini_relations)
                continue
            entities.extend(extract_entities(unit, use_transformers=settings.enable_transformer_ner))
            relations.extend(extract_relations(unit))

        _post_results(document_id, entities, relations)
        _set_document_status(document_id, "PROCESSED")
        logger.info(
            "Processed document %s: %d text units, %d entities, %d relations",
            document_id,
            len(units),
            len(entities),
            len(relations),
        )
    except Exception:
        logger.exception("Failed to process document %s", document_id)
        _set_document_status(document_id, "FAILED")
