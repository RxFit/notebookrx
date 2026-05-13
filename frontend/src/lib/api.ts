import axios from "axios";
import { ChatResponse, IngestResponse, Document, MediaJob, TokenResponse, AuthUser } from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({ baseURL: BASE_URL });

// ── Auth token helpers ─────────────────────────────────────────────────────
const TOKEN_KEY = "notebookrx_token";

export const authStorage = {
  getToken: (): string | null =>
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null,
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// Attach Bearer token to every request automatically
api.interceptors.request.use((config) => {
  const token = authStorage.getToken();
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
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

// ── Auth API ───────────────────────────────────────────────────────────────
export const AuthService = {
  async register(email: string, password: string, displayName?: string): Promise<TokenResponse> {
    const { data } = await api.post("/auth/register", {
      email,
      password,
      display_name: displayName || "",
    });
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

// ── Resource API ───────────────────────────────────────────────────────────
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
    const { data } = await api.post("/api/chat/", {
      query,
      selected_document_ids: selectedDocumentIds,
    });
    return data;
  },

  async generateDiagram(selectedDocumentIds: string[], prompt: string): Promise<{ mermaid: string }> {
    const { data } = await api.post("/api/media/diagram", {
      selected_document_ids: selectedDocumentIds,
      intent: "diagram",
      prompt,
    });
    return data;
  },

  async startAudioJob(selectedDocumentIds: string[]): Promise<{ job_id: string }> {
    const { data } = await api.post("/api/media/audio", {
      selected_document_ids: selectedDocumentIds,
      intent: "audio",
    });
    return data;
  },

  async getJobStatus(jobId: string): Promise<MediaJob> {
    const { data } = await api.get(`/api/media/jobs/${jobId}`);
    return data;
  },
};
