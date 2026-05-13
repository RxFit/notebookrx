import { create } from "zustand";
import { Document, ChatMessage, Note } from "@/types";

type Theme = "light" | "dark" | "system";

interface AppState {
  // Active notebook context
  activeNotebookId: string | null;
  setActiveNotebookId: (id: string | null) => void;

  // Documents / sources
  documents: Document[];
  selectedDocumentIds: Set<string>;
  setDocuments: (docs: Document[]) => void;
  toggleDocument: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;

  // Chat
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (msg: ChatMessage) => void;
  setLoading: (v: boolean) => void;
  clearChat: () => void;

  // Right pane tabs
  rightTab: "notes" | "audio" | "diagram" | "image";
  setRightTab: (tab: "notes" | "audio" | "diagram" | "image") => void;

  // Notes
  notes: Note[];
  setNotes: (notes: Note[]) => void;

  // Pane collapse
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  toggleLeftPane: () => void;
  toggleRightPane: () => void;

  // Theme
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Notebook
  activeNotebookId: null,
  setActiveNotebookId: (id) => set({ activeNotebookId: id, messages: [], documents: [] }),

  // Documents
  documents: [],
  selectedDocumentIds: new Set(),
  setDocuments: (docs) => set({ documents: docs, selectedDocumentIds: new Set(docs.map((d) => d.id)) }),
  toggleDocument: (id) => {
    const s = new Set(get().selectedDocumentIds);
    s.has(id) ? s.delete(id) : s.add(id);
    set({ selectedDocumentIds: s });
  },
  selectAll: () => set((s) => ({ selectedDocumentIds: new Set(s.documents.map((d) => d.id)) })),
  deselectAll: () => set({ selectedDocumentIds: new Set() }),

  // Chat
  messages: [],
  isLoading: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setLoading: (v) => set({ isLoading: v }),
  clearChat: () => set({ messages: [] }),

  // Tabs — Notes is now the first / default tab
  rightTab: "notes",
  setRightTab: (tab) => set({ rightTab: tab }),

  // Notes
  notes: [],
  setNotes: (notes) => set({ notes }),

  // Pane collapse
  leftCollapsed: false,
  rightCollapsed: false,
  toggleLeftPane: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRightPane: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),

  // Theme
  theme: "dark",
  setTheme: (t) => {
    set({ theme: t });
    if (typeof document !== "undefined") {
      const resolved = t === "system"
        ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
        : t;
      document.documentElement.setAttribute("data-theme", resolved);
      localStorage.setItem("notebookrx_theme", t);
    }
  },
}));
