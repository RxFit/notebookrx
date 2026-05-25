import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_register(client: AsyncClient):
    response = await client.post(
        "/auth/register",
        json={
            "email": "test@example.com",
            "password": "StrongPassword123!",
            "display_name": "Test User"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["email"] == "test@example.com"

@pytest.mark.asyncio
async def test_login(client: AsyncClient):
    # Register first
    await client.post(
        "/auth/register",
        json={
            "email": "login-test@example.com",
            "password": "StrongPassword123!",
            "display_name": "Login User"
        }
    )
    
    # Login
    response = await client.post(
        "/auth/login",
        json={
            "email": "login-test@example.com",
            "password": "StrongPassword123!"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["email"] == "login-test@example.com"

@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient):
    # Register first
    await client.post(
        "/auth/register",
        json={
            "email": "wrong-pass@example.com",
            "password": "StrongPassword123!",
            "display_name": "Wrong Pass User"
        }
    )
    
    # Login with wrong password
    response = await client.post(
        "/auth/login",
        json={
            "email": "wrong-pass@example.com",
            "password": "WrongPassword123!"
        }
    )
    assert response.status_code == 401
