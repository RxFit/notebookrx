"use client";
import { useState, useEffect, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAppStore } from "@/store/useAppStore";
import { NotebookService } from "@/lib/api";
import LeftPane from "@/components/LeftPane/LeftPane";
import MiddlePane from "@/components/MiddlePane/MiddlePane";
import RightPane from "@/components/RightPane/RightPane";
import LoginPage from "@/components/Auth/LoginPage";
import SettingsMenu from "@/components/Navigation/SettingsMenu";
import SearchBar from "@/components/Navigation/SearchBar";
import ShareModal from "@/components/Navigation/ShareModal";
import CustomizeModal from "@/components/MiddlePane/CustomizeModal";
import PresenceAvatars from "@/components/Navigation/PresenceAvatars";
import { useCollabPresence } from "@/hooks/useCollabPresence";

export default function NotebookWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id: notebookId } = use(params);
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const { setActiveNotebookId, leftCollapsed, rightCollapsed, toggleLeftPane, toggleRightPane, setTheme } = useAppStore();

  // Real-time collaboration (#26)
  const { users: collabUsers, connected: collabConnected, sendTyping } = useCollabPresence(notebookId);

  // Notebook metadata
  const [notebookTitle, setNotebookTitle] = useState("Notebook");
  const [notebookEmoji, setNotebookEmoji] = useState("📓");
  const [systemPrompt, setSystemPrompt]   = useState<string | undefined>(undefined);

  // UI state
  const [settingsOpen, setSettingsOpen]     = useState(false);
  const [shareOpen, setShareOpen]         = useState(false);
  const [customizeOpen, setCustomizeOpen]   = useState(false);
  const [editingTitle, setEditingTitle]     = useState(false);
  const [titleDraft, setTitleDraft]         = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("notebookrx_theme") as "light" | "dark" | "system" | null;
    if (saved) setTheme(saved);
  }, [setTheme]);

  useEffect(() => {
    if (!notebookId) return;
    setActiveNotebookId(notebookId);
    NotebookService.list().then((nbs) => {
      const found = nbs.find((n) => n.id === notebookId);
      if (found) {
        setNotebookTitle(found.title);
        setNotebookEmoji(found.emoji);
        setSystemPrompt(found.system_prompt ?? undefined);
      }
    }).catch(() => {});
    return () => setActiveNotebookId(null);
  }, [notebookId, setActiveNotebookId]);

  // Auto-focus title input when editing starts
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

  function startEditTitle() { setTitleDraft(notebookTitle); setEditingTitle(true); }

  async function commitTitle() {
    setEditingTitle(false);
    const newTitle = titleDraft.trim() || notebookTitle;
    if (newTitle === notebookTitle) return;
    setNotebookTitle(newTitle);
    try { await NotebookService.update(notebookId, { title: newTitle }); } catch { setNotebookTitle(notebookTitle); }
  }

  function handleTitleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitTitle();
    if (e.key === "Escape") setEditingTitle(false);
  }

  if (isLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-loading"><span className="loading-spinner" /><span>Loading...</span></div>
      </div>
    );
  }
  if (!user) return <LoginPage />;

  const gridCols = [
    leftCollapsed ? "40px" : "280px",
    "1fr",
    rightCollapsed ? "40px" : "340px",
  ].join(" ");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="header-icon-btn" onClick={() => router.push("/")} title="Back to notebooks">&#x2190;</button>
          <a href="/" className="header-brand" style={{ textDecoration: "none" }}>
            <span className="brand-icon">&#x1F9E0;</span>
            <span className="brand-name">NotebookRx</span>
          </a>
          <span className="notebook-breadcrumb-sep">/</span>
          {/* Editable notebook title (#10) */}
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="notebook-title-edit"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={handleTitleKey}
              id="notebook-title-input"
            />
          ) : (
            <button
              className="notebook-breadcrumb notebook-title-clickable"
              onClick={startEditTitle}
              title="Click to rename notebook"
              id="notebook-title-display"
            >
              {notebookEmoji} {notebookTitle}
            </button>
          )}
        </div>

        {/* Search bar (#11) */}
        <div className="header-search">
          <SearchBar notebookId={notebookId} />
        </div>

        <div className="header-actions">
          {/* Real-time presence avatars (#26) */}
          <PresenceAvatars users={collabUsers} connected={collabConnected} />
          {/* Share button (#21) */}
          <button
            id="share-btn"
            className="header-icon-btn"
            onClick={() => setShareOpen(true)}
            title="Share notebook"
          >
            🔗
          </button>
          {/* Customize button (#12) */}
          <button
            id="customize-btn"
            className="header-icon-btn"
            onClick={() => setCustomizeOpen(true)}
            title="Customize notebook system prompt"
          >
            ✏️
          </button>
          <div style={{ position: "relative" }}>
            <button id="settings-btn" className="header-icon-btn" onClick={() => setSettingsOpen(!settingsOpen)} title="Settings">
              &#x2699;&#xFE0F;
            </button>
            {settingsOpen && <SettingsMenu onClose={() => setSettingsOpen(false)} onSignOut={logout} />}
          </div>
          <div className="header-avatar" title={user.email}>
            {(user.display_name || user.email).charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      {shareOpen && (
        <ShareModal notebookId={notebookId} onClose={() => setShareOpen(false)} />
      )}
      {customizeOpen && (
        <CustomizeModal
          notebookId={notebookId}
          currentPrompt={systemPrompt}
          onClose={() => setCustomizeOpen(false)}
          onSaved={(p) => setSystemPrompt(p)}
        />
      )}

      <div className="three-pane-layout" style={{ gridTemplateColumns: gridCols }}>
        <div className={`pane-wrapper ${leftCollapsed ? "pane-wrapper-collapsed" : ""}`}>
          {!leftCollapsed && <LeftPane notebookId={notebookId} />}
          <button
            id="toggle-left-pane"
            className={`pane-collapse-btn left-collapse ${leftCollapsed ? "pane-tab-btn" : ""}`}
            onClick={toggleLeftPane}
            title={leftCollapsed ? "Expand sources" : "Collapse sources"}
          >
            {leftCollapsed ? (
              <span className="pane-tab-inner">
                <span className="pane-tab-chevron">&#x276F;</span>
                <span className="pane-tab-label">Sources</span>
              </span>
            ) : "&#x276E;"}
          </button>
        </div>

        <MiddlePane notebookId={notebookId} systemPrompt={systemPrompt} />

        <div className={`pane-wrapper ${rightCollapsed ? "pane-wrapper-collapsed" : ""}`}>
          {!rightCollapsed && <RightPane notebookId={notebookId} />}
          <button
            id="toggle-right-pane"
            className={`pane-collapse-btn right-collapse ${rightCollapsed ? "pane-tab-btn" : ""}`}
            onClick={toggleRightPane}
            title={rightCollapsed ? "Expand studio" : "Collapse studio"}
          >
            {rightCollapsed ? (
              <span className="pane-tab-inner">
                <span className="pane-tab-chevron">&#x276E;</span>
                <span className="pane-tab-label">Studio</span>
              </span>
            ) : "&#x276F;"}
          </button>
        </div>
      </div>
    </div>
  );
}