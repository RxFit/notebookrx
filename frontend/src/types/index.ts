// Shared TypeScript interfaces — mirrors Pydantic models in backend

export interface Document {
  id: string;
  filename: string;
}

export interface Citation {
  chunk_id: string;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: Date;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
}

export interface IngestResponse {
  document_id: string;
  filename: string;
  chunks: number;
}

export interface MediaJob {
  status: string;
  progress: number;
  url: string | null;
  error: string | null;
  script?: Array<{ speaker: string; dialogue: string }>;
}

export interface AuthUser {
  user_id: string;
  email: string;
  display_name: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  display_name: string;
}
