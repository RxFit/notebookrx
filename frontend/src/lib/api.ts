import axios from "axios";
import { ChatResponse, IngestResponse, Document, MediaJob } from "@/types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  headers: { "x-user-id": "dev-user" }, // Replace with real auth
});

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

  async getJobStatus(jobId: string): Promise<MediaJob> {
    const { data } = await api.get(`/api/media/jobs/${jobId}`);
    return data;
  },
};
