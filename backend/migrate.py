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
        print("✅ Additive migrations applied (google_id, oauth_provider, avatar_url, google_refresh_token)")

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
