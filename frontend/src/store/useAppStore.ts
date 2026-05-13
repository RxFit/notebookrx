import { create } from "zustand";
import { Document, ChatMessage } from "@/types";

interface AppState {
  documents: Document[];
  selectedDocumentIds: Set<string>;
  setDocuments: (docs: Document[]) => void;
  toggleDocument: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (msg: ChatMessage) => void;
  setLoading: (v: boolean) => void;
  clearChat: () => void;
  rightTab: "audio" | "diagram" | "image";
  setRightTab: (tab: "audio" | "diagram" | "image") => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  documents: [],
  selectedDocumentIds: new Set(),
  setDocuments: (docs) => set({ documents: docs }),
  toggleDocument: (id) => {
    const s = new Set(get().selectedDocumentIds);
    s.has(id) ? s.delete(id) : s.add(id);
    set({ selectedDocumentIds: s });
  },
  selectAll: () => set((s) => ({ selectedDocumentIds: new Set(s.documents.map((d) => d.id)) })),
  deselectAll: () => set({ selectedDocumentIds: new Set() }),
  messages: [],
  isLoading: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setLoading: (v) => set({ isLoading: v }),
  clearChat: () => set({ messages: [] }),
  rightTab: "audio",
  setRightTab: (tab) => set({ rightTab: tab }),
}));
