"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAppStore } from "@/store/useAppStore";
import DashboardPage from "@/components/Dashboard/DashboardPage";
import LoginPage from "@/components/Auth/LoginPage";
import SettingsMenu from "@/components/Navigation/SettingsMenu";

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 5)  return "burning the midnight oil";
  if (h < 12) return "starting strong";
  if (h < 17) return "in your prime hours";
  if (h < 21) return "winding down";
  return "up way too late";
}

export default function Home() {
  const { user, isLoading, logout } = useAuth();
  const { theme, setTheme } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Restore theme from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("notebook_blue_theme") as "light" | "dark" | "system" | null;
    if (saved) setTheme(saved);
  }, [setTheme]);

  if (isLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-loading">
          <span className="loading-spinner" />
          <span>Hold on…</span>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const firstName = user.display_name?.split(" ")[0] || "there";

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="header-brand" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="brand-icon material-symbols-rounded" style={{ color: "var(--accent)" }}>dataset</span>
          <span className="brand-name">notebook<span className="brand-dot-blue">.blue</span></span>
        </a>

        <div className="header-actions">
          <div style={{ position: "relative" }}>
            <button
              id="settings-btn"
              className="header-icon-btn material-symbols-rounded"
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="Settings"
              style={{ fontSize: "20px", color: "var(--text-secondary)" }}
            >
              settings
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

      <div className="dash-shell">
        <div className="dash-hero" style={{ marginBottom: "32px", paddingBottom: "16px", borderBottom: "1px solid var(--border)" }}>
          <h1 className="dash-heading" style={{ fontSize: "24px", fontWeight: "700", marginBottom: "4px" }}>
            Hey, {firstName}.
          </h1>
          <p className="dash-subheading" style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            You&rsquo;re {timeOfDay()}. Here are your notebooks.
          </p>
        </div>
        <DashboardPage />
      </div>
    </div>
  );
}
