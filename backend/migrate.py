import asyncio, sys
sys.path.insert(0, '.')
from db.database import engine
from db.models import Base
import sqlalchemy as sa

async def migrate():
    async with engine.begin() as conn:
        # ── Safe additive migrations (ADD COLUMN IF NOT EXISTS) ────────────────
        # W1 — Google OAuth columns (#24)
        await conn.execute(sa.text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR UNIQUE"
        ))
        await conn.execute(sa.text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR"
        ))
        await conn.execute(sa.text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR"
        ))
        # W2 — Google Drive refresh token (#25)
        await conn.execute(sa.text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token VARCHAR"
        ))
        # W4 — Output language preference (#15)
        await conn.execute(sa.text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS output_language VARCHAR NOT NULL DEFAULT 'en'"
        ))
        # W5 — Additional model columns that may be missing from older schemas
        await conn.execute(sa.text(
            "ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS system_prompt TEXT"
        ))
        await conn.execute(sa.text(
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'ready'"
        ))
        await conn.execute(sa.text(
            "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS intent VARCHAR"
        ))
        await conn.execute(sa.text(
            "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS citations_json TEXT"
        ))
        print("✅ Additive migrations applied (google_id, oauth_provider, avatar_url, google_refresh_token, output_language, system_prompt, status, intent, citations_json)")

        # W3 — Performance indexes (audit findings CRIT-3, HIGH-7)
        # HNSW vector index for cosine similarity search on document chunks
        await conn.execute(sa.text("""
            CREATE INDEX IF NOT EXISTS idx_chunks_embedding
            ON document_chunks
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
        """))
        # B-tree index on document_id for chunk filtering in chat queries
        await conn.execute(sa.text("""
            CREATE INDEX IF NOT EXISTS idx_chunks_document_id
            ON document_chunks (document_id)
        """))
        print("✅ Performance indexes applied (HNSW embedding, document_id)")

        # ── Full recreate (only run manually when schema needs reset) ──────────
        # Uncomment the block below ONLY when a full schema rebuild is required.
        # WARNING: this destroys all data.
        #
        # await conn.execute(sa.text("DROP TABLE IF EXISTS notes CASCADE"))
        # await conn.execute(sa.text("DROP TABLE IF EXISTS document_chunks CASCADE"))
        # await conn.execute(sa.text("DROP TABLE IF EXISTS documents CASCADE"))
        # await conn.execute(sa.text("DROP TABLE IF EXISTS notebooks CASCADE"))
        # await conn.execute(sa.text("DROP TABLE IF EXISTS users CASCADE"))
        # await conn.run_sync(Base.metadata.create_all)

        result = await conn.execute(sa.text(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
        ))
        print("Tables:", [r[0] for r in result.fetchall()])

asyncio.run(migrate())
