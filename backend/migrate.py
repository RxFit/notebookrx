import asyncio, sys
sys.path.insert(0, '.')
from db.database import engine
from db.models import Base
import sqlalchemy as sa

async def migrate():
    async with engine.begin() as conn:
        await conn.execute(sa.text("DROP TABLE IF EXISTS document_chunks CASCADE"))
        await conn.execute(sa.text("DROP TABLE IF EXISTS documents CASCADE"))
        await conn.execute(sa.text("DROP TABLE IF EXISTS users CASCADE"))
        await conn.run_sync(Base.metadata.create_all)
        result = await conn.execute(sa.text(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
        ))
        print("Tables:", [r[0] for r in result.fetchall()])

asyncio.run(migrate())
