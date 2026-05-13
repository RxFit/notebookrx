"use client";
import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";

interface Props {
  onClose: () => void;
  onSignOut: () => void;
}

export default function SettingsMenu({ onClose, onSignOut }: Props) {
  const { theme, setTheme } = useAppStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div className="settings-menu" ref={ref} id="settings-menu">
      <div className="settings-section">
        <p className="settings-section-label">Theme</p>
        <div className="settings-theme-group">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              id={`theme-${t}`}
              className={`settings-theme-btn ${theme === t ? "active" : ""}`}
              onClick={() => { setTheme(t); }}
            >
              {t === "light" ? "☀️" : t === "dark" ? "🌙" : "💻"} {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-divider" />

      <button className="settings-item" onClick={() => { window.open("https://github.com/RxFit/notebookrx", "_blank"); onClose(); }}>
        📖 NotebookRx Help
      </button>
      <button className="settings-item" onClick={() => { window.open("mailto:feedback@notebookrx.app", "_blank"); onClose(); }}>
        💬 Send Feedback
      </button>
      <button className="settings-item" onClick={onClose}>
        📄 Licenses
      </button>

      <div className="settings-divider" />

      <button className="settings-item settings-item-danger" onClick={() => { onSignOut(); onClose(); }}>
        🚪 Sign Out
      </button>
    </div>
  );
}
