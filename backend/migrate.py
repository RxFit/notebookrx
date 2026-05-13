import asyncio, sys
sys.path.insert(0, '.')
from db.database import engine
from db.models import Base
import sqlalchemy as sa

async def migrate():
    async with engine.begin() as conn:
        # Drop all existing tables cleanly (preserves existing data pattern)
        await conn.execute(sa.text("DROP TABLE IF EXISTS notes CASCADE"))
        await conn.execute(sa.text("DROP TABLE IF EXISTS document_chunks CASCADE"))
        await conn.execute(sa.text("DROP TABLE IF EXISTS documents CASCADE"))
        await conn.execute(sa.text("DROP TABLE IF EXISTS notebooks CASCADE"))
        await conn.execute(sa.text("DROP TABLE IF EXISTS users CASCADE"))
        # Recreate all tables from the updated models
        await conn.run_sync(Base.metadata.create_all)
        result = await conn.execute(sa.text(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
        ))
        print("Tables:", [r[0] for r in result.fetchall()])

asyncio.run(migrate())
