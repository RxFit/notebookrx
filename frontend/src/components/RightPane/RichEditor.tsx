"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback } from "react";

interface Props {
  content: string;           // HTML string
  onChange: (html: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export default function RichEditor({ content, onChange, placeholder = "Start writing...", readOnly = false }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external content changes (e.g. switching notes)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    const prev = editor?.getAttributes("link").href ?? "";
    const url = window.prompt("Enter URL", prev);
    if (url === null) return;
    if (url === "") { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="rich-editor">
      {!readOnly && (
        <div className="rich-toolbar" role="toolbar" aria-label="Text formatting">
          {/* History */}
          <button className="rich-btn" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">↩</button>
          <button className="rich-btn" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">↪</button>
          <span className="rich-divider" />
          {/* Heading styles */}
          <button className="rich-btn" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} data-active={editor.isActive("heading", { level: 1 })} title="Heading 1">H1</button>
          <button className="rich-btn" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} data-active={editor.isActive("heading", { level: 2 })} title="Heading 2">H2</button>
          <button className="rich-btn" onClick={() => editor.chain().focus().setParagraph().run()} data-active={editor.isActive("paragraph")} title="Normal text">¶</button>
          <span className="rich-divider" />
          {/* Inline marks */}
          <button className="rich-btn" onClick={() => editor.chain().focus().toggleBold().run()} data-active={editor.isActive("bold")} title="Bold"><strong>B</strong></button>
          <button className="rich-btn" onClick={() => editor.chain().focus().toggleItalic().run()} data-active={editor.isActive("italic")} title="Italic"><em>I</em></button>
          <span className="rich-divider" />
          {/* Lists */}
          <button className="rich-btn" onClick={() => editor.chain().focus().toggleBulletList().run()} data-active={editor.isActive("bulletList")} title="Bullet list">• —</button>
          <button className="rich-btn" onClick={() => editor.chain().focus().toggleOrderedList().run()} data-active={editor.isActive("orderedList")} title="Numbered list">1.</button>
          <span className="rich-divider" />
          {/* Link */}
          <button className="rich-btn" onClick={setLink} data-active={editor.isActive("link")} title="Insert link">🔗</button>
        </div>
      )}
      <EditorContent editor={editor} className="rich-editor-body" />
    </div>
  );
}