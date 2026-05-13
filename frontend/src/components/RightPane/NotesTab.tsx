"use client";
import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { NoteService, ApiService } from "@/lib/api";
import { Note } from "@/types";

interface Props { notebookId: string; }

export default function NotesTab({ notebookId }: Props) {
  const { notes, setNotes, documents } = useAppStore();
  const [editing, setEditing] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await NoteService.list(notebookId);
      setNotes(data);
    } catch { /* ignore */ }
  }, [notebookId, setNotes]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing({ id: "", notebook_id: notebookId, title: "", content: "", created_at: "", updated_at: "" });
    setEditTitle("");
    setEditContent("");
  };

  const openEdit = (note: Note) => {
    setEditing(note);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const saveNote = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      if (editing!.id) {
        await NoteService.update(editing!.id, { title: editTitle, content: editContent });
      } else {
        await NoteService.create(notebookId, editTitle, editContent);
      }
      await load();
      setEditing(null);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await NoteService.remove(id);
      await load();
    } catch { /* ignore */ }
  };

  const convertToSource = async (note: Note) => {
    setConverting(note.id);
    try {
      await ApiService.uploadText(note.title, note.content, notebookId);
      setMessage(`"${note.title}" added as a source!`);
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage("Failed to convert note to source.");
    } finally {
      setConverting(null);
    }
  };

  if (editing !== null) {
    return (
      <div className="tab-content notes-editor">
        <input
          className="notes-title-input"
          placeholder="Note title..."
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          autoFocus
        />
        <textarea
          className="notes-body-input"
          placeholder="Start writing..."
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={12}
        />
        <div className="notes-editor-actions">
          <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          <button className="action-btn" onClick={saveNote} disabled={saving || !editTitle.trim()}>
            {saving ? "Saving..." : "Save Note"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-content">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="tab-section-title">📝 Notes</h3>
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
                  <button className="doc-delete" onClick={() => deleteNote(note.id)} title="Delete note">✕</button>
                </div>
              </div>
              <p className="note-card-preview">{note.content.slice(0, 120)}{note.content.length > 120 ? "..." : ""}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
