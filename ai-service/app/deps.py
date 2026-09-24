import psycopg2
import redis
from minio import Minio
from neo4j import GraphDatabase

from app.config import settings


def get_neo4j_driver():
    return GraphDatabase.driver(
        settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password)
    )


def get_redis_client():
    return redis.Redis(host=settings.redis_host, port=settings.redis_port, socket_timeout=2)


def get_minio_client():
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=False,
    )


def check_postgres() -> bool:
    try:
        conn = psycopg2.connect(settings.postgres_dsn, connect_timeout=2)
        conn.close()
        return True
    except Exception:
        return False


def check_neo4j() -> bool:
    try:
        driver = get_neo4j_driver()
        driver.verify_connectivity()
        driver.close()
        return True
    except Exception:
        return False


def check_redis() -> bool:
    try:
        return get_redis_client().ping()
    except Exception:
        return False


def check_minio() -> bool:
    try:
        client = get_minio_client()
        if not client.bucket_exists(settings.minio_evidence_bucket):
            client.make_bucket(settings.minio_evidence_bucket)
        return True
    except Exception:
        return False
