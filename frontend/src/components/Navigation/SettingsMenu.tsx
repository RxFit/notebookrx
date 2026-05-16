"use client";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { AuthService } from "@/lib/api";

interface Props { onClose: () => void; onSignOut: () => void; }

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
];

export default function SettingsMenu({ onClose, onSignOut }: Props) {
  const { theme, setTheme } = useAppStore();
  const ref = useRef<HTMLDivElement>(null);
  const [language, setLanguage] = useState("en");
  const [showHelp, setShowHelp]           = useState(false);
  const [showFeedback, setShowFeedback]   = useState(false);
  const [feedback, setFeedback]           = useState("");
  const [feedbackSent, setFeedbackSent]   = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("notebookrx_language") || "en";
    setLanguage(saved);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  async function handleLanguageChange(code: string) {
    setLanguage(code);
    localStorage.setItem("notebookrx_language", code);
    try { await AuthService.updateLanguage(code); } catch { /* silently fail */ }
  }

  function submitFeedback() {
    // In production this would POST to a feedback endpoint
    setFeedbackSent(true);
    setFeedback("");
    setTimeout(() => { setShowFeedback(false); setFeedbackSent(false); }, 2500);
  }

  // Help overlay
  if (showHelp) {
    return (
      <div className="settings-menu settings-menu-wide" ref={ref} id="help-overlay">
        <div className="settings-header-row">
          <strong>NotebookRx Help</strong>
          <button className="modal-close" onClick={() => setShowHelp(false)}>✕</button>
        </div>
        <div className="help-section">
          <p className="help-heading">Keyboard Shortcuts</p>
          <div className="help-row"><kbd>Enter</kbd><span>Send chat message</span></div>
          <div className="help-row"><kbd>Shift+Enter</kbd><span>New line in chat</span></div>
          <div className="help-row"><kbd>Esc</kbd><span>Close modal / cancel edit</span></div>
        </div>
        <div className="help-section">
          <p className="help-heading">Getting Started</p>
          <p className="help-text">1. Add sources (PDF, TXT, URL, or YouTube) via the left pane.</p>
          <p className="help-text">2. Ask questions in the Chat — answers are grounded in your sources.</p>
          <p className="help-text">3. Click citation badges [1] to jump to the source document.</p>
          <p className="help-text">4. Use Studio tabs to generate Audio, Summaries, and Study Guides.</p>
        </div>
        <a className="settings-item" href="https://github.com/RxFit/notebookrx" target="_blank" rel="noopener noreferrer" onClick={onClose}>
          📖 View on GitHub
        </a>
      </div>
    );
  }

  // Feedback modal
  if (showFeedback) {
    return (
      <div className="settings-menu settings-menu-wide" ref={ref} id="feedback-modal">
        <div className="settings-header-row">
          <strong>Send Feedback</strong>
          <button className="modal-close" onClick={() => setShowFeedback(false)}>✕</button>
        </div>
        {feedbackSent ? (
          <p style={{ fontSize: 13, color: "var(--success)", padding: "12px 0" }}>✅ Thank you for your feedback!</p>
        ) : (
          <>
            <textarea
              className="modal-textarea"
              placeholder="Tell us what you think, report a bug, or suggest a feature..."
              rows={5}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <button className="action-btn" onClick={submitFeedback} disabled={!feedback.trim()}>
              Send Feedback
            </button>
          </>
        )}
      </div>
    );
  }

  // Main settings menu
  return (
    <div className="settings-menu" ref={ref} id="settings-menu">
      {/* Theme */}
      <div className="settings-section">
        <p className="settings-section-label">Theme</p>
        <div className="settings-theme-group">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              id={`theme-${t}`}
              className={`settings-theme-btn ${theme === t ? "active" : ""}`}
              onClick={() => setTheme(t)}
            >
              {t === "light" ? "☀️" : t === "dark" ? "🌙" : "💻"} {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-divider" />

      {/* Output Language (#15) */}
      <div className="settings-section">
        <p className="settings-section-label">Output Language</p>
        <select
          id="language-select"
          className="settings-select"
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      <div className="settings-divider" />

      {/* Help & Feedback (#16) */}
      <button className="settings-item" id="help-btn" onClick={() => setShowHelp(true)}>
        ❓ NotebookRx Help
      </button>
      <button className="settings-item" id="feedback-btn" onClick={() => setShowFeedback(true)}>
        💬 Send Feedback
      </button>
      <button className="settings-item" onClick={() => { window.open("https://github.com/RxFit/notebookrx/blob/master/LICENSE", "_blank"); onClose(); }}>
        📄 Licenses
      </button>

      <div className="settings-divider" />

      <button className="settings-item settings-item-danger" onClick={() => { onSignOut(); onClose(); }}>
        🚪 Sign Out
      </button>
    </div>
  );
}