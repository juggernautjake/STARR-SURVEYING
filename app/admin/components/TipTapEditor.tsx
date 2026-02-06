// app/admin/components/TipTapEditor.tsx
'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import LinkExtension from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { useEffect, useCallback, useState } from 'react';

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
const COLORS = [
  '#0F1419', '#374151', '#6B7280', '#9CA3AF',
  '#1D3095', '#3B82F6', '#059669', '#10B981',
  '#D97706', '#F59E0B', '#BD1218', '#EF4444',
  '#7C3AED', '#A78BFA', '#EC4899', '#F472B6',
];

export default function TipTapEditor({ content, onChange, placeholder = 'Start writing...' }: TipTapEditorProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      LinkExtension.configure({ openOnClick: false }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
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
        {/* Text formatting */}
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

        {/* Text color */}
        <div className="tiptap-editor__toolbar-group" style={{ position: 'relative' }}>
          <button
            type="button"
            className="tiptap-editor__btn"
            onClick={() => { setShowColorPicker(!showColorPicker); setShowFontSize(false); }}
            title="Text Color"
            style={{ position: 'relative' }}
          >
            <span style={{ borderBottom: `3px solid ${editor.getAttributes('textStyle').color || '#0F1419'}` }}>A</span>
          </button>
          <button
            type="button"
            className="tiptap-editor__btn"
            onClick={() => { setShowFontSize(!showFontSize); setShowColorPicker(false); }}
            title="Font Size"
          >
            <span style={{ fontSize: '.65rem' }}>Aa</span>
          </button>
          {showColorPicker && (
            <div className="tiptap-editor__dropdown" onClick={e => e.stopPropagation()}>
              <div className="tiptap-editor__color-grid">
                {COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className="tiptap-editor__color-swatch"
                    style={{ background: color }}
                    onClick={() => {
                      editor.chain().focus().setColor(color).run();
                      setShowColorPicker(false);
                    }}
                    title={color}
                  />
                ))}
              </div>
              <button
                type="button"
                className="tiptap-editor__dropdown-btn"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setShowColorPicker(false);
                }}
              >
                Reset Color
              </button>
            </div>
          )}
          {showFontSize && (
            <div className="tiptap-editor__dropdown" onClick={e => e.stopPropagation()}>
              {FONT_SIZES.map(size => (
                <button
                  key={size}
                  type="button"
                  className="tiptap-editor__dropdown-btn"
                  style={{ fontSize: size }}
                  onClick={() => {
                    editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
                    setShowFontSize(false);
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Headings */}
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
          <button
            type="button"
            className={`tiptap-editor__btn ${editor.isActive('heading', { level: 4 }) ? 'tiptap-editor__btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            title="Heading 4"
          >
            H4
          </button>
        </div>

        {/* Lists & blocks */}
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

        {/* Alignment */}
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

        {/* Media & links */}
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

        {/* Utilities */}
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
