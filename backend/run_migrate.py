"""
One-off migration runner for Railway.
Run via Railway shell: python run_migrate.py
Also used as Railway pre-deploy command.

Adds new columns/tables without dropping existing data.
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
            # G1 — Chat History Persistence
            """CREATE TABLE IF NOT EXISTS chat_messages (
                id VARCHAR PRIMARY KEY,
                notebook_id VARCHAR NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
                user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role VARCHAR NOT NULL,
                content TEXT NOT NULL,
                citations_json TEXT,
                intent VARCHAR,
                created_at TIMESTAMPTZ DEFAULT now()
            )""",
            "CREATE INDEX IF NOT EXISTS ix_chat_messages_notebook_id ON chat_messages(notebook_id)",
            "CREATE INDEX IF NOT EXISTS ix_chat_messages_user_id ON chat_messages(user_id)",
        ]
        for sql in migrations:
            await conn.execute(sa.text(sql))
            label = sql.strip().split('\n')[0][:80]
            print(f"  \u2713 {label}")

        # Verify users table
        result = await conn.execute(sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'users' ORDER BY ordinal_position"
        ))
        cols = [r[0] for r in result.fetchall()]
        print(f"\nUsers table columns: {cols}")

        # Verify chat_messages table
        result2 = await conn.execute(sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'chat_messages' ORDER BY ordinal_position"
        ))
        cols2 = [r[0] for r in result2.fetchall()]
        print(f"Chat_messages table columns: {cols2}")

        print("\n\u2705 Migration complete.")

asyncio.run(migrate())
