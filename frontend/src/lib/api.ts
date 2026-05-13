import axios from "axios";
import { ChatResponse, IngestResponse, Document, MediaJob, TokenResponse, AuthUser, Notebook, Note } from "@/types";

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

export const NotebookService = {
  async list(): Promise<Notebook[]> {
    const { data } = await api.get("/api/notebooks/");
    return data;
  },
  async create(title: string, emoji: string): Promise<Notebook> {
    const { data } = await api.post("/api/notebooks/", { title, emoji });
    return data;
  },
  async update(id: string, patch: { title?: string; emoji?: string }): Promise<Notebook> {
    const { data } = await api.patch(`/api/notebooks/${id}`, patch);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/notebooks/${id}`);
  },
};

export const NoteService = {
  async list(notebookId: string): Promise<Note[]> {
    const { data } = await api.get("/api/notes/", { params: { notebook_id: notebookId } });
    return data;
  },
  async create(notebookId: string, title: string, content: string): Promise<Note> {
    const { data } = await api.post("/api/notes/", { notebook_id: notebookId, title, content });
    return data;
  },
  async update(id: string, patch: { title?: string; content?: string }): Promise<Note> {
    const { data } = await api.patch(`/api/notes/${id}`, patch);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/notes/${id}`);
  },
};

export const ApiService = {
  async listDocuments(notebookId?: string): Promise<Document[]> {
    const params = notebookId ? { notebook_id: notebookId } : {};
    const { data } = await api.get("/api/ingest/documents", { params });
    return data;
  },
  async uploadDocument(file: File, notebookId?: string): Promise<IngestResponse> {
    const form = new FormData();
    form.append("file", file);
    if (notebookId) form.append("notebook_id", notebookId);
    const { data } = await api.post("/api/ingest/", form);
    return data;
  },
  async uploadText(title: string, content: string, notebookId?: string): Promise<IngestResponse> {
    const form = new FormData();
    form.append("title", title);
    form.append("content", content);
    if (notebookId) form.append("notebook_id", notebookId);
    const { data } = await api.post("/api/ingest/text", form);
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
  async fetchAudioBlob(jobId: string): Promise<string> {
    const token = authStorage.getToken();
    const res = await fetch(`${BASE_URL}/api/media/audio/${jobId}.mp3`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Audio fetch failed: ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
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
