import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI

from app.deps import check_minio, check_neo4j, check_postgres, check_redis
from app.kafka_consumer import consume_document_uploaded
from app.resolution.router import router as resolution_router
from app.analytics.router import router as analytics_router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop_event = asyncio.Event()
    consumer_task = asyncio.create_task(consume_document_uploaded(stop_event))
    yield
    stop_event.set()
    await consumer_task


app = FastAPI(
    title="Investigation Intelligence System - AI Service",
    description="Processing, NLP, entity resolution, graph analytics and explainability service.",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(resolution_router)
app.include_router(analytics_router)


@app.get("/health")
def health():
    dependencies = {
        "postgres": check_postgres(),
        "neo4j": check_neo4j(),
        "redis": check_redis(),
        "minio": check_minio(),
    }
    healthy = all(dependencies.values())
    return {
        "status": "ok" if healthy else "degraded",
        "service": "iis-ai-service",
        "dependencies": dependencies,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
