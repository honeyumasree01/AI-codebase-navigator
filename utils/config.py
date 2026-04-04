from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    github_token: str
    anthropic_api_key: str
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_api_key: str
    pinecone_api_key: str
    pinecone_index: str
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str
    redis_url: str
    database_url: str
    api_token: str


def get_settings() -> Settings:
    return Settings()
