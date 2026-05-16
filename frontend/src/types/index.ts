export interface Document { id: string; filename: string; }
export interface Citation {
  chunk_id: string;
  excerpt: string;
  document_id: string;  // which source document this chunk belongs to (for source-jump UX)
}
export interface ChatMessage {
  id: string; role: "user" | "assistant";
  content: string; citations?: Citation[]; timestamp: Date;
}
export interface ChatResponse { answer: string; citations: Citation[]; }
export interface IngestResponse { document_id: string; filename: string; chunks: number; }
export interface MediaJob {
  status: string; progress: number;
  url: string | null; error: string | null;
  script?: Array<{ speaker: string; dialogue: string }>;
  refined_prompt?: string;
  image_b64?: string;
}
export interface AuthUser { user_id: string; email: string; display_name: string; }
export interface TokenResponse {
  access_token: string; token_type: string;
  user_id: string; email: string; display_name: string;
}
export interface Notebook {
  id: string;
  title: string;
  emoji: string;
  source_count: number;
  created_at: string;
  updated_at: string;
}
export interface Note {
  id: string;
  notebook_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}