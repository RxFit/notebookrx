from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    # Database
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379"

    # Gemini
    GEMINI_API_KEY: str
    EMBEDDING_MODEL: str = "gemini-embedding-001"
    EMBEDDING_DIMENSIONS: int = 3072
    CHAT_MODEL: str = "gemini-2.5-flash"
    PRO_MODEL: str = "gemini-2.5-flash"

    # Limits
    MAX_FILE_SIZE_MB: int = 20
    MAX_CHUNKS_PER_DOC: int = 500

    # Google OAuth (#24) — optional, feature-flags gracefully if not set
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    FRONTEND_URL: str = "https://notebook.blue"

    # JWT Auth
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 10080   # 7 days

settings = Settings()
