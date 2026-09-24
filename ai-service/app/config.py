from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    postgres_dsn: str = "postgresql://iis_user:iis_password@postgres:5432/iis_db"
    neo4j_uri: str = "bolt://neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "neo4jpassword"
    redis_host: str = "redis"
    redis_port: int = 6379
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_evidence_bucket: str = "evidence"
    kafka_bootstrap_servers: str = "kafka:9092"
    kafka_document_uploaded_topic: str = "document-uploaded"
    kafka_consumer_group: str = "ai-service"

    backend_internal_url: str = "http://backend:3000"
    internal_service_key: str = "change-me-in-production"
    enable_transformer_ner: bool = True

    # Multilingual (Hindi/regional-language) extraction - see nlp/gemini_extraction.py.
    # Empty gemini_api_key means the feature silently no-ops (English-only pipeline
    # keeps working exactly as before); get a free key at aistudio.google.com and
    # set it in .env, never here.
    enable_multilingual_nlp: bool = True
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"

    class Config:
        env_file = ".env"


settings = Settings()
