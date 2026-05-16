"use client";
import { useState, useEffect } from "react";
import { NoteService, ApiService } from "@/lib/api";
import { Note } from "@/types";
import RichEditor from "./RichEditor";
import DOMPurify from "dompurify";

interface Props { notebookId: string; }

export default function NotesTab({ notebookId }: Props) {
  const [notes, setNotes]         = useState<Note[]>([]);
  const [editing, setEditing]     = useState<Note | null>(null);
  const [isNew, setIsNew]         = useState(false);
  const [title, setTitle]         = useState("");
  const [content, setContent]     = useState("");
  const [message, setMessage]     = useState("");
  const [converting, setConverting] = useState<string | null>(null);

  useEffect(() => { loadNotes(); }, [notebookId]);

  async function loadNotes() {
    try { setNotes(await NoteService.list(notebookId)); } catch { /* silently ignore */ }
  }

  function openNew() { setEditing(null); setIsNew(true); setTitle(""); setContent("<p></p>"); }
  function openEdit(note: Note) { setEditing(note); setIsNew(false); setTitle(note.title); setContent(note.content); }
  function cancel() { setEditing(null); setIsNew(false); setTitle(""); setContent(""); }

  async function save() {
    if (!title.trim()) return;
    try {
      if (isNew) {
        const created = await NoteService.create(notebookId, title.trim(), content);
        setNotes((prev) => [created, ...prev]);
      } else if (editing) {
        const updated = await NoteService.update(editing.id, { title: title.trim(), content });
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      }
      cancel();
    } catch { setMessage("Save failed — please try again."); }
  }

  async function deleteNote(id: string) {
    try {
      await NoteService.remove(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (editing?.id === id) cancel();
    } catch { /* ignore */ }
  }

  async function convertToSource(note: Note) {
    setConverting(note.id);
    try {
      // Strip HTML tags to plain text for ingestion
      const plain = DOMPurify.sanitize(note.content, { ALLOWED_TAGS: [] });
      await ApiService.uploadText(note.title, plain, notebookId);
      setMessage(`"${note.title}" added as a searchable source.`);
      setTimeout(() => setMessage(""), 4000);
    } catch { setMessage("Conversion failed."); } finally { setConverting(null); }
  }

  // Editor view
  if (isNew || editing) {
    return (
      <div className="tab-content">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 className="tab-section-title" style={{ margin: 0 }}>{isNew ? "New Note" : "Edit Note"}</h3>
          <button className="btn-ghost" style={{ fontSize: 11 }} onClick={cancel}>Cancel</button>
        </div>

        <input
          className="note-title-input"
          placeholder="Note title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ marginBottom: 10 }}
        />

        <RichEditor
          content={content}
          onChange={setContent}
          placeholder="Write your note here..."
        />

        {message && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>{message}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="action-btn" onClick={save} disabled={!title.trim()}>
            {isNew ? "Create Note" : "Save Changes"}
          </button>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="tab-content">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h3 className="tab-section-title" style={{ margin: 0 }}>📝 Notes</h3>
        <button id="new-note-btn" className="action-btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={openNew}>
          + New Note
        </button>
      </div>
      <p className="tab-desc">Capture insights from your sources. Notes can be converted into searchable source documents.</p>

      {message && <p style={{ fontSize: 12, color: "var(--success)", background: "rgba(16,185,129,0.1)", padding: "8px 10px", borderRadius: 6 }}>{message}</p>}

      {notes.length === 0 ? (
        <div className="empty-state" style={{ padding: "30px 0" }}>
          <p>No notes yet.</p>
          <p>Create a note to capture key insights.</p>
        </div>
      ) : (
        <div className="notes-list">
          {notes.map((note) => (
            <div key={note.id} className="note-card">
              <div className="note-card-header">
                <h4 className="note-card-title">{note.title}</h4>
                <div className="note-card-actions">
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 10 }}
                    onClick={() => convertToSource(note)}
                    disabled={converting === note.id}
                    title="Add this note as a searchable source"
                  >
                    {converting === note.id ? "..." : "→ Source"}
                  </button>
                  <button className="btn-ghost" style={{ fontSize: 10 }} onClick={() => openEdit(note)}>Edit</button>
                  <button className="doc-delete" onClick={() => deleteNote(note.id)} title="Delete note">🗑</button>
                </div>
              </div>
              {/* Render rich HTML preview safely */}
              <div
                className="note-card-preview rich-preview"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(note.content, { ALLOWED_TAGS: ["p","strong","em","h1","h2","h3","ul","ol","li","a","br"] })
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}