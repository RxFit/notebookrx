"""
One-off migration runner for Railway.
Run via Railway shell: python run_migrate.py

Adds new columns for Google OAuth (#24) and Google Drive (#25) without dropping existing data.
"""
import asyncio, sys
sys.path.insert(0, '.')
from db.database import engine
import sqlalchemy as sa

async def migrate():
    async with engine.begin() as conn:
        migrations = [
            # W1 — Google OAuth (#24)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR UNIQUE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR",
            # W2 — Google Drive (#25)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token VARCHAR",
        ]
        for sql in migrations:
            await conn.execute(sa.text(sql))
            print(f"  ✓ {sql}")

        result = await conn.execute(sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'users' ORDER BY ordinal_position"
        ))
        cols = [r[0] for r in result.fetchall()]
        print(f"\nUsers table columns: {cols}")
        print("\n✅ Migration complete.")

asyncio.run(migrate())
