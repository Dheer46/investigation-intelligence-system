"""Shared pydantic schemas for the extraction pipeline. These are the payload
shapes posted back to the NestJS backend, so every entity/relation carries its
provenance (location_ref) from the moment it is created - never bolted on later.
"""

from typing import Optional

from pydantic import BaseModel, Field


class ExtractedEntityPayload(BaseModel):
    entity_type: str = Field(..., description="PERSON | PHONE | VEHICLE | LOCATION | ORGANIZATION | BANK_ACCOUNT | DATE | EVENT")
    raw_text: str
    normalized: Optional[str] = None
    location_ref: str
    confidence: float = Field(ge=0.0, le=1.0)
    source: str = Field(..., description="spacy | regex | transformers | gemini")


class ExtractedRelationPayload(BaseModel):
    source_text: str
    subject_text: str
    predicate: str
    object_text: str
    location_ref: str
    confidence: float = Field(ge=0.0, le=1.0)


class ExtractionResultPayload(BaseModel):
    entities: list[ExtractedEntityPayload]
    relations: list[ExtractedRelationPayload]


class AutoMergeGroupPayload(BaseModel):
    entity_type: str
    canonical_name: str
    member_entity_ids: list[str]
    attributes: Optional[dict] = None


class ReviewCandidateGroupPayload(BaseModel):
    entity_type: str
    canonical_name: str
    member_entity_ids: list[str]
    match_score: float = Field(ge=0.0, le=1.0)


class ResolutionResultsPayload(BaseModel):
    auto_merges: list[AutoMergeGroupPayload]
    review_candidates: list[ReviewCandidateGroupPayload]


class HypothesisPayload(BaseModel):
    hypothesis_text: str
    evidence_summary: dict
    confidence: float = Field(ge=0.0, le=1.0)
    provenance: dict


class HypothesesBulkPayload(BaseModel):
    hypotheses: list[HypothesisPayload]
