"""
WebSocket real-time presence — /api/ws/{notebook_id}
Broadcasts: { type: "presence", users: [{user_id, display_name, color}] }
            { type: "cursor",   user_id, position }
            { type: "chat_typing", user_id, display_name }
"""
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from auth.jwt_handler import decode_token
from collections import defaultdict
from typing import Any

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


@router.websocket("/{notebook_id}")
async def notebook_ws(
    websocket: WebSocket,
    notebook_id: str,
    token: str = Query(...),
):
    """WebSocket endpoint — clients authenticate via ?token=<jwt>"""
    # Validate JWT
    try:
        payload = decode_token(token)
        user_id      = payload["sub"]
        display_name = payload.get("display_name", "Anonymous")
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
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