"use client";
import { useAuth } from "@/context/AuthContext";
import LeftPane from "@/components/LeftPane/LeftPane";
import MiddlePane from "@/components/MiddlePane/MiddlePane";
import RightPane from "@/components/RightPane/RightPane";
import LoginPage from "@/components/Auth/LoginPage";

export default function Home() {
  const { user, isLoading, logout } = useAuth();

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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">🧠</span>
          <span className="brand-name">NotebookLM <span className="brand-tag">Clone</span></span>
        </div>
        <p className="header-tagline">Deterministic AI · Zero Hallucinations · Grounded in your sources</p>
        <div className="header-user">
          <span className="user-email">{user.display_name || user.email}</span>
          <button className="logout-btn" onClick={logout} title="Sign out">
            Sign out
          </button>
        </div>
      </header>
      <div className="three-pane-layout">
        <LeftPane />
        <MiddlePane />
        <RightPane />
      </div>
    </div>
  );
}
