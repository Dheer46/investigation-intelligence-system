"""Relationship extraction (MVP): spaCy dependency parser + rule-based patterns
+ regex. Sentence -> dependency parse -> subject/verb/object (and verb+prep+object)
triples. Every relation keeps `location_ref` so it can be traced back to its
source sentence/row/page - required for the explainable-AI and audit stages.
"""

from typing import List, Optional

import spacy
from spacy.tokens import Span, Token

from app.common.schemas import ExtractedRelationPayload
from app.extraction.extract import TextUnit

_nlp = spacy.load("en_core_web_sm")

_SUBJECT_DEPS = {"nsubj", "nsubjpass"}
_OBJECT_DEPS = {"dobj", "attr", "dative", "oprd"}


def _entity_span_for_token(doc, token: Token) -> Optional[Span]:
    for ent in doc.ents:
        if ent.start <= token.i < ent.end:
            return ent
    return None


def _span_text(doc, token: Token) -> tuple[str, bool]:
    """Prefer the full named-entity text when the token sits inside one,
    otherwise fall back to its noun-chunk subtree so the relation still
    reads as a phrase rather than a single stranded token."""
    ent = _entity_span_for_token(doc, token)
    if ent is not None:
        return ent.text, True
    subtree = list(token.subtree)
    start = min(t.i for t in subtree)
    end = max(t.i for t in subtree) + 1
    return doc[start:end].text, False


def extract_relations(unit: TextUnit) -> List[ExtractedRelationPayload]:
    doc = _nlp(unit.text)
    relations: List[ExtractedRelationPayload] = []

    for sent in doc.sents:
        for token in sent:
            if token.pos_ != "VERB":
                continue

            subjects = [child for child in token.children if child.dep_ in _SUBJECT_DEPS]
            if not subjects:
                continue

            direct_objects = [child for child in token.children if child.dep_ in _OBJECT_DEPS]
            prep_objects: list[tuple[str, Token]] = []
            for child in token.children:
                if child.dep_ == "prep":
                    for grandchild in child.children:
                        if grandchild.dep_ == "pobj":
                            prep_objects.append((child.text, grandchild))

            if not direct_objects and not prep_objects:
                continue

            for subj in subjects:
                subj_text, subj_is_entity = _span_text(doc, subj)

                for obj in direct_objects:
                    obj_text, obj_is_entity = _span_text(doc, obj)
                    relations.append(
                        _build_relation(
                            unit, sent.text, subj_text, token.lemma_, obj_text, subj_is_entity, obj_is_entity
                        )
                    )

                for prep_text, pobj in prep_objects:
                    obj_text, obj_is_entity = _span_text(doc, pobj)
                    predicate = f"{token.lemma_}_{prep_text}"
                    relations.append(
                        _build_relation(
                            unit, sent.text, subj_text, predicate, obj_text, subj_is_entity, obj_is_entity
                        )
                    )

    return relations


def _build_relation(
    unit: TextUnit,
    sentence_text: str,
    subject_text: str,
    predicate: str,
    object_text: str,
    subj_is_entity: bool,
    obj_is_entity: bool,
) -> ExtractedRelationPayload:
    confidence = 0.6
    if subj_is_entity and obj_is_entity:
        confidence = 0.8
    elif subj_is_entity or obj_is_entity:
        confidence = 0.7

    return ExtractedRelationPayload(
        source_text=sentence_text.strip(),
        subject_text=subject_text.strip(),
        predicate=predicate,
        object_text=object_text.strip(),
        location_ref=unit.location_ref,
        confidence=confidence,
    )
