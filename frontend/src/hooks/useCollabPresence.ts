"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { api, authStorage } from "@/lib/api";

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
    let cancelled = false;

    // RxHarden T5: Fetch a short-lived ticket before connecting
    async function connect() {
      let url: string;
      try {
        const { data } = await api.post("/api/ws/ticket");
        url = `${WS_BASE}/api/ws/${notebookId}?ticket=${encodeURIComponent(data.ticket)}`;
      } catch {
        // Fallback to legacy JWT auth if ticket service is unavailable
        const token = authStorage.getToken();
        if (!token) return;
        url = `${WS_BASE}/api/ws/${notebookId}?token=${encodeURIComponent(token)}`;
      }

      if (cancelled) return;

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
    }

    connect();

    // Heartbeat every 25s to keep connection alive through Railway proxy
    const hb = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 25_000);

    return () => {
      cancelled = true;
      clearInterval(hb);
      wsRef.current?.close();
    };
  }, [notebookId]);

  return { users, connected, sendTyping };
}