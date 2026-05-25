import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from db.database import Base, get_db
from main import app
from config import settings

# Test database URL
TEST_DATABASE_URL = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest.fixture
async def db_session(test_engine):
    AsyncSessionLocal = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with AsyncSessionLocal() as session:
        yield session
        await session.rollback()

@pytest.fixture
async def client(db_session):
    async def _get_test_db():
        yield db_session
    
    app.dependency_overrides[get_db] = _get_test_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
