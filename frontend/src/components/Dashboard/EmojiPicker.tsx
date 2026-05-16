"use client";
import { useState } from "react";

const EMOJI_OPTIONS = [
  "📓","📔","📒","📕","📗","📘","📙","📚",
  "🧠","💡","🔬","🔭","🧪","⚗️","🧬","🔮",
  "🏥","💊","🩺","🩻","🧬","💉","🫀","🧫",
  "📊","📈","📉","🗂️","🗃️","📋","📌","🗒️",
];

interface Props {
  value: string;
  onChange: (emoji: string) => void;
}

export default function EmojiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="emoji-picker-wrapper">
      <button
        type="button"
        id="emoji-picker-btn"
        className="emoji-picker-trigger"
        onClick={() => setOpen(!open)}
        title="Choose notebook emoji"
      >
        <span style={{ fontSize: 28 }}>{value}</span>
        <span className="emoji-picker-hint">▾</span>
      </button>
      {open && (
        <div className="emoji-picker-grid">
          {EMOJI_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              className={`emoji-option ${value === e ? "emoji-selected" : ""}`}
              onClick={() => { onChange(e); setOpen(false); }}
              title={e}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}