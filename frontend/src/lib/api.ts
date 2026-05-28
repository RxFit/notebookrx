import axios from "axios";
import { Notebook, Note, Document, ChatResponse, IngestResponse, MediaJob, AuthUser, TokenResponse, StudyGuide, SearchResult, ChatMessage } from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export const authStorage = {
  getToken: () => (typeof window !== "undefined" ? localStorage.getItem("notebookrx_token") : null),
  setToken: (t: string) => { if (typeof window !== "undefined") localStorage.setItem("notebookrx_token", t); },
  clear: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("notebookrx_token");
      localStorage.removeItem("notebookrx_user");
    }
  },
};

export const api = axios.create({ baseURL: BASE_URL, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = authStorage.getToken();
  if (token) config.headers.Authorization = "Bearer " + token;
  return config;
});


// RxHarden T4: Silent refresh interceptor
let isRefreshing = false;
let refreshSubscribers: ((ok: boolean) => void)[] = [];

function onRefreshComplete(ok: boolean) {
  refreshSubscribers.forEach((cb) => cb(ok));
  refreshSubscribers = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    
    // Only attempt refresh on 401 (not on login/register/refresh endpoints)
    if (
      err.response?.status === 401 &&
      typeof window !== "undefined" &&
      !original._retry &&
      !original.url?.includes("/auth/login") &&
      !original.url?.includes("/auth/register") &&
      !original.url?.includes("/auth/refresh")
    ) {
      if (isRefreshing) {
        // Wait for the in-flight refresh to complete
        return new Promise((resolve, reject) => {
          refreshSubscribers.push((ok) => {
            if (ok) {
              original._retry = true;
              resolve(api(original));
            } else {
              reject(err);
            }
          });
        });
      }

      isRefreshing = true;
      original._retry = true;

      try {
        await api.post("/auth/refresh");
        onRefreshComplete(true);
        isRefreshing = false;
        return api(original);
      } catch {
        onRefreshComplete(false);
        isRefreshing = false;
        authStorage.clear();
        window.dispatchEvent(new Event("auth:logout"));
        return Promise.reject(err);
      }
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
  async updateLanguage(language: string): Promise<void> {
    await api.patch("/auth/me", { output_language: language });
  },
  async logout(): Promise<void> {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    authStorage.clear();
  },
};

export const NotebookService = {
  async list(): Promise<Notebook[]> {
    const { data } = await api.get("/api/notebooks/");
    return data;
  },
  async get(id: string): Promise<Notebook> {
    const { data } = await api.get("/api/notebooks/" + id);
    return data;
  },
  async create(title: string, emoji: string): Promise<Notebook> {
    const { data } = await api.post("/api/notebooks/", { title, emoji });
    return data;
  },
  async update(id: string, patch: { title?: string; emoji?: string; system_prompt?: string }): Promise<Notebook> {
    const { data } = await api.patch("/api/notebooks/" + id, patch);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete("/api/notebooks/" + id);
  },
  async search(notebookId: string, q: string): Promise<SearchResult[]> {
    const { data } = await api.get("/api/notebooks/" + notebookId + "/search", { params: { q } });
    return data;
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
    const { data } = await api.patch("/api/notes/" + id, patch);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete("/api/notes/" + id);
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
    const { data } = await api.post("/api/ingest/upload", form);
    return data;
  },
  async uploadText(title: string, content: string, notebookId?: string): Promise<IngestResponse> {
    const { data } = await api.post("/api/ingest/text", {
      title,
      content,
      ...(notebookId ? { notebook_id: notebookId } : {}),
    });
    return data;
  },
  async ingestUrl(url: string, notebookId?: string): Promise<IngestResponse> {
    const { data } = await api.post("/api/ingest/url", {
      url,
      ...(notebookId ? { notebook_id: notebookId } : {}),
    });
    return data;
  },
  async ingestYoutube(youtubeUrl: string, notebookId?: string): Promise<IngestResponse> {
    const { data } = await api.post("/api/ingest/youtube", {
      url: youtubeUrl,                                     // backend field is 'url', not 'youtube_url'
      ...(notebookId ? { notebook_id: notebookId } : {}),
    });
    return data;
  },
  async deleteDocument(id: string): Promise<void> {
    await api.delete("/api/ingest/" + id);
  },
  async chat(query: string, selectedDocumentIds: string[], creativity?: number, notebookId?: string): Promise<ChatResponse> {
    const { data } = await api.post("/api/chat/", {
      query,
      selected_document_ids: selectedDocumentIds,
      notebook_id: notebookId,
      ...(creativity !== undefined ? { temperature: creativity } : {}),
    });
    return data;
  },
  // —— G1: Chat history persistence ——
  async getChatHistory(notebookId: string): Promise<ChatMessage[]> {
    const { data } = await api.get("/api/chat/history", { params: { notebook_id: notebookId } });
    // Map backend response to frontend ChatMessage shape
    return data.map((item: { id: string; role: "user" | "assistant"; content: string; citations?: { chunk_id: string; excerpt: string; document_id: string }[]; created_at: string }) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      citations: item.citations || [],
      timestamp: new Date(item.created_at),
    }));
  },
  async clearChatHistory(notebookId: string): Promise<void> {
    await api.delete("/api/chat/history", { params: { notebook_id: notebookId } });
  },
  async summarizeSources(selectedDocumentIds: string[]): Promise<{ summary: string }> {
    const { data } = await api.post("/api/media/summarize", { selected_document_ids: selectedDocumentIds });
    return data;
  },
  async generateStudyGuide(selectedDocumentIds: string[]): Promise<StudyGuide> {
    const { data } = await api.post("/api/media/studyguide", { selected_document_ids: selectedDocumentIds });
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
    const { data } = await api.get("/api/media/jobs/" + jobId);
    return data;
  },
  async fetchAudioBlob(jobId: string): Promise<string> {
    const token = authStorage.getToken();
    const res = await fetch(BASE_URL + "/api/media/audio/" + jobId + ".mp3", {
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    if (!res.ok) throw new Error("Audio fetch failed: " + res.status);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  async fetchImageBlob(jobId: string): Promise<string> {
    const token = authStorage.getToken();
    const res = await fetch(BASE_URL + "/api/media/image/" + jobId + ".png", {
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    if (!res.ok) throw new Error("Image fetch failed: " + res.status);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};
