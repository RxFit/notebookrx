"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAppStore } from "@/store/useAppStore";
import { NotebookService } from "@/lib/api";
import LeftPane from "@/components/LeftPane/LeftPane";
import MiddlePane from "@/components/MiddlePane/MiddlePane";
import RightPane from "@/components/RightPane/RightPane";
import LoginPage from "@/components/Auth/LoginPage";
import SettingsMenu from "@/components/Navigation/SettingsMenu";

export default function NotebookWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id: notebookId } = use(params);
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const { setActiveNotebookId, leftCollapsed, rightCollapsed, toggleLeftPane, toggleRightPane, setTheme } = useAppStore();
  const [notebookTitle, setNotebookTitle] = useState("Notebook");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("notebookrx_theme") as "light" | "dark" | "system" | null;
    if (saved) setTheme(saved);
  }, [setTheme]);

  useEffect(() => {
    if (!notebookId) return;
    setActiveNotebookId(notebookId);
    NotebookService.list().then((nbs) => {
      const found = nbs.find((n) => n.id === notebookId);
      if (found) setNotebookTitle(`${found.emoji} ${found.title}`);
    }).catch(() => {});
    return () => setActiveNotebookId(null);
  }, [notebookId, setActiveNotebookId]);

  if (isLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-loading">
          <span className="loading-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  // Collapsed panes shrink to a 40px tab strip — always visible so user can re-expand
  const gridCols = [
    leftCollapsed ? "40px" : "280px",
    "1fr",
    rightCollapsed ? "40px" : "340px",
  ].join(" ");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="header-icon-btn"
            onClick={() => router.push("/")}
            title="Back to notebooks"
          >
            &larr;
          </button>
          <a href="/" className="header-brand" style={{ textDecoration: "none" }}>
            <span className="brand-icon">&#x1F9E0;</span>
            <span className="brand-name">NotebookRx</span>
          </a>
          <span className="notebook-breadcrumb">{notebookTitle}</span>
        </div>

        <div className="header-actions">
          <div style={{ position: "relative" }}>
            <button
              id="settings-btn"
              className="header-icon-btn"
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="Settings"
            >
              &#x2699;&#xFE0F;
            </button>
            {settingsOpen && (
              <SettingsMenu
                onClose={() => setSettingsOpen(false)}
                onSignOut={logout}
              />
            )}
          </div>
          <div className="header-avatar" title={user.email}>
            {(user.display_name || user.email).charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <div className="three-pane-layout" style={{ gridTemplateColumns: gridCols }}>

        {/* LEFT PANE WRAPPER */}
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

        <MiddlePane notebookId={notebookId} />

        {/* RIGHT PANE WRAPPER */}
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