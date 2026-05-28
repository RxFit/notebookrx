"""
WebSocket real-time presence — /api/ws/{notebook_id}
Broadcasts: { type: "presence", users: [{user_id, display_name, color}] }
            { type: "cursor",   user_id, position }
            { type: "chat_typing", user_id, display_name }

RxHarden Phase 3 Task 5: Ticket-based WebSocket auth replaces JWT-in-query-param.
"""
import json
import logging
import asyncio
import secrets
import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends, HTTPException
from sqlalchemy import select
from auth.jwt_handler import get_current_user
from db.database import AsyncSessionLocal
from db.models import Notebook
from collections import defaultdict
from typing import Any
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ws", tags=["websocket"])

# Notebook ID → { user_id: {"ws": WebSocket, "display_name": str, "color": str} }
_rooms: dict[str, dict[str, Any]] = defaultdict(dict)

# Fixed palette for user presence colors
_COLORS = [
    "#6366f1", "#ec4899", "#f59e0b", "#10b981",
    "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
]


def _color_for(user_id: str) -> str:
    return _COLORS[hash(user_id) % len(_COLORS)]


async def _broadcast_presence(notebook_id: str):
    """Push current user list to all connected clients."""
    room = _rooms[notebook_id]
    payload = json.dumps({
        "type": "presence",
        "users": [
            {"user_id": uid, "display_name": info["display_name"], "color": info["color"]}
            for uid, info in room.items()
        ],
    })
    dead = []
    for uid, info in list(room.items()):
        try:
            await info["ws"].send_text(payload)
        except Exception:
            dead.append(uid)
    for uid in dead:
        room.pop(uid, None)


@router.post("/ticket")
async def create_ws_ticket(user=Depends(get_current_user)):
    """RxHarden T5: Issue a short-lived, single-use WebSocket ticket."""
    try:
        r = aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True, socket_connect_timeout=2)
        await r.ping()
    except Exception:
        raise HTTPException(status_code=503, detail="Ticket service unavailable.")

    ticket = secrets.token_urlsafe(32)
    payload = json.dumps({"user_id": user.id, "display_name": user.display_name})
    await r.set(f"ws:ticket:{ticket}", payload, ex=30)  # 30s TTL
    await r.aclose()
    return {"ticket": ticket, "expires_in": 30}


@router.websocket("/{notebook_id}")
async def notebook_ws(
    websocket: WebSocket,
    notebook_id: str,
    ticket: str = Query(None),
    token: str = Query(None),  # Legacy fallback
):
    """WebSocket endpoint — RxHarden T5: ticket-based auth (legacy token fallback)."""
    user_id = None
    display_name = "Anonymous"

    if ticket:
        # Ticket-based auth (preferred)
        try:
            r = aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True, socket_connect_timeout=2)
            pipe = r.pipeline()
            pipe.get(f"ws:ticket:{ticket}")
            pipe.delete(f"ws:ticket:{ticket}")  # Single-use
            results = await pipe.execute()
            await r.aclose()
            payload_str = results[0]
            if not payload_str:
                await websocket.close(code=4001, reason="Invalid or expired ticket")
                return
            payload = json.loads(payload_str)
            user_id = payload["user_id"]
            display_name = payload.get("display_name", "Anonymous")
        except Exception:
            await websocket.close(code=4001, reason="Ticket validation failed")
            return
    elif token:
        # Legacy JWT fallback
        from auth.jwt_handler import decode_token
        try:
            payload = decode_token(token)
            user_id = payload["sub"]
            display_name = payload.get("display_name", "Anonymous")
        except Exception:
            await websocket.close(code=4001, reason="Invalid token")
            return
    else:
        await websocket.close(code=4001, reason="No authentication provided")
        return

    # Verify user owns this notebook before accepting the connection
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Notebook.id).where(
                Notebook.id == notebook_id,
                Notebook.user_id == user_id,
            )
        )
        if not result.scalar_one_or_none():
            await websocket.close(code=4003, reason="Not authorized for this notebook")
            return

    await websocket.accept()

    # Register in room
    _rooms[notebook_id][user_id] = {
        "ws":           websocket,
        "display_name": display_name,
        "color":        _color_for(user_id),
    }
    await _broadcast_presence(notebook_id)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")

            if msg_type == "cursor":
                # Relay cursor position to all other clients
                payload = json.dumps({"type": "cursor", "user_id": user_id, "position": msg.get("position")})
                for uid, info in list(_rooms[notebook_id].items()):
                    if uid != user_id:
                        try:
                            await info["ws"].send_text(payload)
                        except Exception:
                            pass

            elif msg_type == "typing":
                # Broadcast typing indicator
                payload = json.dumps({"type": "chat_typing", "user_id": user_id, "display_name": display_name})
                for uid, info in list(_rooms[notebook_id].items()):
                    if uid != user_id:
                        try:
                            await info["ws"].send_text(payload)
                        except Exception:
                            pass

            elif msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        pass
    finally:
        _rooms[notebook_id].pop(user_id, None)
        if _rooms[notebook_id]:
            await _broadcast_presence(notebook_id)
        elif notebook_id in _rooms:
            del _rooms[notebook_id]