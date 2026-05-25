import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_ssrf_block(client: AsyncClient):
    # Mock registration/login if needed or use public endpoint
    # Assuming /api/ingest/url is protected, we need to register/login
    reg = await client.post(
        "/auth/register",
        json={"email": "ssrf@example.com", "password": "Password123!"}
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Try internal IP
    response = await client.post(
        "/api/ingest/url",
        json={"url": "http://169.254.169.254/latest/meta-data/", "notebook_id": "none"},
        headers=headers
    )
    # Based on phase 1 fix, it should return 400 or be blocked
    assert response.status_code in [400, 422]
