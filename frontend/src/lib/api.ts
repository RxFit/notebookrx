import axios from "axios";
import { ChatResponse, IngestResponse, Document, MediaJob, TokenResponse, AuthUser } from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const api = axios.create({ baseURL: BASE_URL });

const TOKEN_KEY = "notebookrx_token";

export const authStorage = {
  getToken: (): string | null => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  },
  setToken: (token: string) => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* quota exceeded */ }
    sessionStorage.setItem(TOKEN_KEY, token);
  },
  clear: () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  },
};

api.interceptors.request.use((config) => {
  const token = authStorage.getToken();
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      authStorage.clear();
      window.dispatchEvent(new Event("auth:logout"));
    }
    return Promise.reject(err);
  }
);

export const AuthService = {
  async register(email: string, password: string, displayName?: string): Promise<TokenResponse> {
    const { data } = await api.post("/auth/register", { email, password, display_name: displayName || "" });
    return data;
  },
  async login(email: string, password: string): Promise<TokenResponse> {
    const { data } = await api.post("/auth/login", { email, password });
    return data;
  },
  async me(): Promise<AuthUser> {
    const { data } = await api.get("/auth/me");
    return data;
  },
};

export const ApiService = {
  async listDocuments(): Promise<Document[]> {
    const { data } = await api.get("/api/ingest/documents");
    return data;
  },
  async uploadDocument(file: File): Promise<IngestResponse> {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post("/api/ingest/", form);
    return data;
  },
  async deleteDocument(id: string): Promise<void> {
    await api.delete(`/api/ingest/${id}`);
  },
  async chat(query: string, selectedDocumentIds: string[]): Promise<ChatResponse> {
    const { data } = await api.post("/api/chat/", { query, selected_document_ids: selectedDocumentIds });
    return data;
  },
  async generateDiagram(selectedDocumentIds: string[], prompt: string): Promise<{ mermaid: string }> {
    const { data } = await api.post("/api/media/diagram", { selected_document_ids: selectedDocumentIds, intent: "diagram", prompt });
    return data;
  },
  async startAudioJob(selectedDocumentIds: string[]): Promise<{ job_id: string }> {
    const { data } = await api.post("/api/media/audio", { selected_document_ids: selectedDocumentIds, intent: "audio" });
    return data;
  },
  async startImageJob(selectedDocumentIds: string[], prompt: string): Promise<{ job_id: string }> {
    const { data } = await api.post("/api/media/image", { selected_document_ids: selectedDocumentIds, intent: "image", prompt });
    return data;
  },
  async getJobStatus(jobId: string): Promise<MediaJob> {
    const { data } = await api.get(`/api/media/jobs/${jobId}`);
    return data;
  },
  // Fetches MP3 with Authorization header — browsers can't add JWT to <audio src> directly
  async fetchAudioBlob(jobId: string): Promise<string> {
    const token = authStorage.getToken();
    const res = await fetch(`${BASE_URL}/api/media/audio/${jobId}.mp3`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Audio fetch failed: ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  // Fetches PNG with Authorization header
  async fetchImageBlob(jobId: string): Promise<string> {
    const token = authStorage.getToken();
    const res = await fetch(`${BASE_URL}/api/media/image/${jobId}.png`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};
