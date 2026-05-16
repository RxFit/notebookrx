"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { authStorage } from "@/lib/api";

export interface PresenceUser {
  user_id: string;
  display_name: string;
  color: string;
}

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ||
  (typeof window !== "undefined" && window.location.hostname === "notebook.blue"
    ? "wss://notebookrx-api-production.up.railway.app"
    : "ws://localhost:8000");

export function useCollabPresence(notebookId: string | null) {
  const [users, setUsers]         = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const sendTyping = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "typing" }));
  }, []);

  useEffect(() => {
    if (!notebookId) return;
    const token = authStorage.getToken();
    if (!token) return;

    const url = `${WS_BASE}/api/ws/${notebookId}?token=${encodeURIComponent(token)}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen  = () => setConnected(true);
    ws.onclose = () => { setConnected(false); setUsers([]); };
    ws.onerror = () => setConnected(false);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "presence") setUsers(msg.users || []);
        if (msg.type === "pong") { /* heartbeat ok */ }
      } catch { /* ignore malformed */ }
    };

    // Heartbeat every 25s to keep connection alive through Railway proxy
    const hb = setInterval(() => ws.send(JSON.stringify({ type: "ping" })), 25_000);

    return () => {
      clearInterval(hb);
      ws.close();
    };
  }, [notebookId]);

  return { users, connected, sendTyping };
}