// app/admin/components/ArticleEditor.tsx — Rich article editor with HTML source, preview, and media toolbar
'use client';

import { useState, useRef, useCallback } from 'react';

interface ArticleEditorProps {
  article: any;
  onSave: (updates: any) => Promise<boolean>;
}

export default function ArticleEditor({ article, onSave }: ArticleEditorProps) {
  const [title, setTitle] = useState(article?.title || '');
  const [subtitle, setSubtitle] = useState(article?.subtitle || '');
  const [author, setAuthor] = useState(article?.author || '');
  const [slug, setSlug] = useState(article?.slug || '');
  const [excerpt, setExcerpt] = useState(article?.excerpt || '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(article?.estimated_minutes || 10);
  const [category, setCategory] = useState(article?.category || '');
  const [status, setStatus] = useState(article?.status || 'draft');
  const [tags, setTags] = useState<string[]>(article?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [content, setContent] = useState(article?.content || '');
  const [activeTab, setActiveTab] = useState<'source' | 'preview'>('source');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newContent = content.substring(0, start) + snippet + content.substring(end);
    setContent(newContent);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + snippet.length;
    }, 0);
  }, [content]);

  const wrapSelection = useCallback((openTag: string, closeTag: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end);
    const newContent = content.substring(0, start) + openTag + selected + closeTag + content.substring(end);
    setContent(newContent);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + openTag.length;
      ta.selectionEnd = start + openTag.length + selected.length;
    }, 0);
  }, [content]);

  // Format toolbar handlers
  const handleBold = () => wrapSelection('<strong>', '</strong>');
  const handleItalic = () => wrapSelection('<em>', '</em>');
  const handleH2 = () => wrapSelection('<h2>', '</h2>');
  const handleH3 = () => wrapSelection('<h3>', '</h3>');
  const handleParagraph = () => wrapSelection('<p>', '</p>');
  const handleBlockquote = () => wrapSelection('<blockquote>', '</blockquote>');
  const handleHR = () => insertAtCursor('\n<hr />\n');
  const handleUL = () => insertAtCursor('<ul>\n  <li></li>\n  <li></li>\n</ul>');
  const handleOL = () => insertAtCursor('<ol>\n  <li></li>\n  <li></li>\n</ol>');

  // Media insertion handlers
  const handleLink = () => {
    const url = prompt('Enter URL:');
    if (!url) return;
    const text = prompt('Link text:', 'Link') || 'Link';
    insertAtCursor(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  };

  const handleImage = () => {
    const url = prompt('Image URL (or path like /articles/survey-chain/image.jpg):');
    if (!url) return;
    const alt = prompt('Alt text (description):', '') || '';
    const caption = prompt('Caption (optional):', '') || '';
    const snippet = caption
      ? `<figure>\n  <img src="${url}" alt="${alt}" data-article-image />\n  <figcaption>${caption}</figcaption>\n</figure>`
      : `<img src="${url}" alt="${alt}" data-article-image />`;
    insertAtCursor(snippet);
  };

  const handleYouTube = () => {
    const input = prompt('YouTube video URL or ID:');
    if (!input) return;
    let videoId = input;
    const match = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
    if (match) videoId = match[1];
    insertAtCursor(
      `<div class="article-video" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1.5rem 0;border-radius:8px;">\n` +
      `  <iframe src="https://www.youtube.com/embed/${videoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>\n` +
      `</div>`
    );
  };

  const handleVideo = () => {
    const url = prompt('Video file URL:');
    if (!url) return;
    insertAtCursor(`<video controls style="width:100%;max-width:100%;border-radius:8px;margin:1.5rem 0;" src="${url}"></video>`);
  };

  const handleAudio = () => {
    const url = prompt('Audio file URL:');
    if (!url) return;
    const audioTitle = prompt('Audio title (optional):', '') || 'Audio';
    insertAtCursor(
      `<div class="article-audio" style="margin:1.5rem 0;padding:1rem;background:rgba(59,130,246,0.08);border-radius:8px;">\n` +
      `  <p style="margin:0 0 0.5rem;font-weight:600;">${audioTitle}</p>\n` +
      `  <audio controls style="width:100%;" src="${url}"></audio>\n` +
      `</div>`
    );
  };

  const handlePDF = () => {
    const url = prompt('PDF file URL:');
    if (!url) return;
    const pdfTitle = prompt('PDF title:', 'Document') || 'Document';
    insertAtCursor(
      `<div class="article-pdf" style="margin:1.5rem 0;padding:1rem;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:8px;">\n` +
      `  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:0.5rem;color:#3B82F6;font-weight:600;text-decoration:none;">&#x1F4C4; ${pdfTitle}</a>\n` +
      `</div>`
    );
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const updates = {
      id: article?.id,
      title, subtitle, author, slug, excerpt,
      estimated_minutes: estimatedMinutes,
      category, status, tags, content,
    };
    const ok = await onSave(updates);
    if (ok) setSaved(true);
    setSaving(false);
    if (ok) setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="article-editor">
      {/* Metadata Section */}
      <div className="article-editor__meta">
        <div className="article-editor__meta-row">
          <div className="article-editor__field article-editor__field--wide">
            <label>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Article title" />
          </div>
          <div className="article-editor__field" style={{ maxWidth: '140px' }}>
            <label>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>
        <div className="article-editor__meta-row">
          <div className="article-editor__field">
            <label>Author</label>
            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author name" />
          </div>
          <div className="article-editor__field">
            <label>Subtitle</label>
            <input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Subtitle" />
          </div>
        </div>
        <div className="article-editor__meta-row">
          <div className="article-editor__field">
            <label>Slug</label>
            <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="url-slug" />
          </div>
          <div className="article-editor__field">
            <label>Category</label>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category" />
          </div>
          <div className="article-editor__field" style={{ maxWidth: '120px' }}>
            <label>Read Time</label>
            <input type="number" value={estimatedMinutes} onChange={e => setEstimatedMinutes(parseInt(e.target.value) || 0)} min={1} />
          </div>
        </div>
        <div className="article-editor__field">
          <label>Excerpt</label>
          <textarea rows={2} value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Short summary for article cards" />
        </div>
        <div className="article-editor__field">
          <label>Tags</label>
          <div className="article-editor__tags">
            {tags.map(t => (
              <span key={t} className="article-editor__tag">
                {t} <button type="button" onClick={() => setTags(tags.filter(x => x !== t))}>&times;</button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
              placeholder="Add tag + Enter"
              style={{ flex: 1, minWidth: '100px' }}
            />
          </div>
        </div>
      </div>

      {/* Content Editor */}
      <div className="article-editor__content">
        {/* Toolbar */}
        <div className="article-editor__toolbar">
          <div className="article-editor__toolbar-group">
            <button type="button" onClick={handleBold} title="Bold"><strong>B</strong></button>
            <button type="button" onClick={handleItalic} title="Italic"><em>I</em></button>
            <button type="button" onClick={handleH2} title="Heading 2">H2</button>
            <button type="button" onClick={handleH3} title="Heading 3">H3</button>
            <button type="button" onClick={handleParagraph} title="Paragraph">P</button>
          </div>
          <div className="article-editor__toolbar-group">
            <button type="button" onClick={handleLink} title="Insert Link">Link</button>
            <button type="button" onClick={handleImage} title="Insert Image">Img</button>
            <button type="button" onClick={handleYouTube} title="YouTube Embed">YT</button>
            <button type="button" onClick={handleVideo} title="Insert Video">Vid</button>
            <button type="button" onClick={handleAudio} title="Insert Audio">Audio</button>
            <button type="button" onClick={handlePDF} title="Insert PDF">PDF</button>
          </div>
          <div className="article-editor__toolbar-group">
            <button type="button" onClick={handleBlockquote} title="Blockquote">Quote</button>
            <button type="button" onClick={handleHR} title="Horizontal Rule">HR</button>
            <button type="button" onClick={handleUL} title="Unordered List">UL</button>
            <button type="button" onClick={handleOL} title="Ordered List">OL</button>
          </div>
          <div className="article-editor__toolbar-tabs">
            <button type="button" className={activeTab === 'source' ? 'active' : ''} onClick={() => setActiveTab('source')}>Source</button>
            <button type="button" className={activeTab === 'preview' ? 'active' : ''} onClick={() => setActiveTab('preview')}>Preview</button>
          </div>
        </div>

        {/* Editor Area */}
        {activeTab === 'source' ? (
          <textarea
            ref={textareaRef}
            className="article-editor__source"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="<p>Write your article HTML here...</p>"
            spellCheck={false}
          />
        ) : (
          <div
            className="article-editor__preview article-reader__content"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>

      {/* Save Bar */}
      <div className="article-editor__save-bar">
        <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Article'}
        </button>
        {saved && <span style={{ color: '#10B981', fontSize: '0.85rem', marginLeft: '0.75rem' }}>Changes saved successfully</span>}
      </div>
    </div>
  );
}
