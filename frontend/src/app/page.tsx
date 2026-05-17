"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAppStore } from "@/store/useAppStore";
import DashboardPage from "@/components/Dashboard/DashboardPage";
import LoginPage from "@/components/Auth/LoginPage";
import SettingsMenu from "@/components/Navigation/SettingsMenu";

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
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
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const firstName = user.display_name?.split(" ")[0] || "there";

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="header-brand" style={{ textDecoration: "none" }}>
          <span className="brand-icon">🧠</span>
          <span className="brand-name">notebook<span className="brand-dot-blue">.blue</span></span>
        </a>

        <div className="header-actions">
          <div style={{ position: "relative" }}>
            <button
              id="settings-btn"
              className="header-icon-btn"
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="Settings"
            >
              ⚙️
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
        <div className="dash-hero">
          <h1 className="dash-heading">Good {timeOfDay()}, {firstName} 👋</h1>
          <p className="dash-subheading">AI-powered research, grounded in your sources</p>
        </div>
        <DashboardPage />
      </div>
    </div>
  );
}
