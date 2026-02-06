// app/admin/components/TipTapEditor.tsx
'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useCallback } from 'react';

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function TipTapEditor({ content, onChange, placeholder = 'Start writing...' }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor__content',
      },
    },
  });

  // Update content when external content changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('Image URL');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="tiptap-editor">
      {/* Toolbar */}
      <div className="tiptap-editor__toolbar">
        <div className="tiptap-editor__toolbar-group">
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('bold') ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('italic') ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('underline') ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <u>U</u>
          </button>
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('strike') ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <s>S</s>
          </button>
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('highlight') ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            title="Highlight"
          >
            H
          </button>
        </div>

        <div className="tiptap-editor__toolbar-group">
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('heading', { level: 2 }) ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            H2
          </button>
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('heading', { level: 3 }) ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            H3
          </button>
        </div>

        <div className="tiptap-editor__toolbar-group">
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('bulletList') ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            &bull;
          </button>
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('orderedList') ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered List"
          >
            1.
          </button>
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('blockquote') ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
          >
            &ldquo;
          </button>
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('codeBlock') ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="Code Block"
          >
            {'</>'}
          </button>
        </div>

        <div className="tiptap-editor__toolbar-group">
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive({ textAlign: 'left' }) ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            title="Align Left"
          >
            &#8676;
          </button>
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive({ textAlign: 'center' }) ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            title="Align Center"
          >
            &#8596;
          </button>
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive({ textAlign: 'right' }) ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            title="Align Right"
          >
            &#8677;
          </button>
        </div>

        <div className="tiptap-editor__toolbar-group">
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('link') ? 'tiptap-editor__btn--active' : ''}`}
            onClick={setLink}
            title="Link"
          >
            🔗
          </button>
          <button
            type="button"
            className="tiptap-editor__btn"
            onClick={addImage}
            title="Image"
          >
            🖼
          </button>
        </div>

        <div className="tiptap-editor__toolbar-group">
          <button
            type="button"
            className="tiptap-editor__btn"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Rule"
          >
            —
          </button>
          <button
            type="button"
            className="tiptap-editor__btn"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            ↩
          </button>
          <button
            type="button"
            className="tiptap-editor__btn"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            ↪
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}
