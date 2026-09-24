"""
Stateless ML service: video frames in, face embeddings + liveness scores out.

Deliberately knows nothing about PINs, officers, USB tokens, or the database -
that logic all lives in the Nest backend (same boundary this codebase already
enforces for the ai-service: "the frontend never calls the ai-service
directly - every AI-triggered action is proxied through the authenticated,
RBAC-guarded NestJS backend"). This service is reachable only from other
containers on the compose network, not from the public frontend.

Reuses face_engine.py unchanged from the original local-only face-detection
project - same SCRFD detector, ArcFace recognizer, MiniFASNetV2 liveness
model, same thresholds. Only the deployment shape changed: local Windows
process on 127.0.0.1 -> a container any workstation's backend call can reach.
"""

import base64
import numpy as np
import cv2

from fastapi import FastAPI
from pydantic import BaseModel

from face_engine import FaceEngine

app = FastAPI()
eng: FaceEngine | None = None


class ExtractReq(BaseModel):
    images: list[str]


class FrameResult(BaseModel):
    ok: bool
    embedding: list[float] | None = None
    liveness: float | None = None
    reason: str | None = None


class ExtractResp(BaseModel):
    results: list[FrameResult]


@app.on_event("startup")
def startup():
    global eng
    eng = FaceEngine()


@app.get("/health")
def health():
    return {"ok": eng is not None}


def decode_image(data: str):
    raw = base64.b64decode(data.split(",", 1)[-1])
    return cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)


@app.post("/extract", response_model=ExtractResp)
def extract(r: ExtractReq):
    results: list[FrameResult] = []
    for encoded in r.images:
        img = decode_image(encoded)
        if img is None:
            results.append(FrameResult(ok=False, reason="Invalid image"))
            continue

        det = eng.detect_single(img)
        if det is None:
            results.append(FrameResult(ok=False, reason="Exactly one face required"))
            continue

        box, k, det_score = det
        live = eng.liveness(img, box)

        aligned = eng.align(img, k)
        e = eng.embedding(aligned)
        if e is None:
            results.append(FrameResult(ok=False, reason="Embedding failed", liveness=live))
            continue

        results.append(FrameResult(ok=True, embedding=e.tolist(), liveness=live))

    return ExtractResp(results=results)
