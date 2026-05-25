import { create } from "zustand";
import { Document, ChatMessage, Note } from "@/types";

type Theme = "light" | "dark" | "system";
type MobileTab = "sources" | "chat" | "studio";

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

  // Citation â†’ source highlight
  highlightedDocumentId: string | null;
  setHighlightedDocument: (id: string | null) => void;

  // Chat
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;  // G1: bulk-set for history loading
  setLoading: (v: boolean) => void;
  clearChat: () => void;

  // Right pane tabs
  rightTab: "notes" | "summary" | "study" | "audio" | "diagram" | "image";
  setRightTab: (tab: "notes" | "summary" | "study" | "audio" | "diagram" | "image") => void;

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

  // Mobile tab navigation
  mobileTab: MobileTab;
  setMobileTab: (tab: MobileTab) => void;
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

  // Citation â†’ source highlight
  highlightedDocumentId: null,
  setHighlightedDocument: (id) => {
    set({ highlightedDocumentId: id });
    if (id !== null) {
      setTimeout(() => set({ highlightedDocumentId: null }), 3000);
    }
  },

  // Chat
  messages: [],
  isLoading: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),  // G1: bulk-set for history loading
  setLoading: (v) => set({ isLoading: v }),
  clearChat: () => set({ messages: [] }),

  // Tabs
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
      localStorage.setItem("notebook_blue_theme", t);
    }
  },

  // Mobile tab â€” defaults to chat (primary mobile action)
  mobileTab: "chat",
  setMobileTab: (tab) => set({ mobileTab: tab }),
}));
