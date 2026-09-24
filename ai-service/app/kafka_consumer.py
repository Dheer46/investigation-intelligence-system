import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer

from app.config import settings
from app.pipeline import process_document

logger = logging.getLogger("ai-service.kafka_consumer")


async def consume_document_uploaded(stop_event: asyncio.Event) -> None:
    consumer = AIOKafkaConsumer(
        settings.kafka_document_uploaded_topic,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        auto_offset_reset="earliest",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )

    for attempt in range(10):
        try:
            await consumer.start()
            break
        except Exception as exc:  # noqa: BLE001 - Kafka may still be electing a leader
            logger.warning("Kafka consumer start attempt %s failed: %s", attempt + 1, exc)
            await asyncio.sleep(3)
    else:
        logger.error("Could not connect to Kafka after retries; consumer disabled")
        return

    logger.info("Subscribed to topic '%s'", settings.kafka_document_uploaded_topic)
    try:
        while not stop_event.is_set():
            try:
                batch = await asyncio.wait_for(consumer.getmany(timeout_ms=1000), timeout=2)
            except asyncio.TimeoutError:
                continue
            for records in batch.values():
                for record in records:
                    event = record.value
                    logger.info("document-uploaded event received: %s", event)
                    try:
                        # Runs the full extraction pipeline synchronously; fine at
                        # hackathon/demo volume. Move to a worker pool before scaling
                        # to real CDR/transaction ingestion volumes (Phase 9).
                        await asyncio.to_thread(process_document, event)
                    except Exception as exc:  # noqa: BLE001
                        logger.error("Failed to process document-uploaded event: %s", exc)
    finally:
        await consumer.stop()
