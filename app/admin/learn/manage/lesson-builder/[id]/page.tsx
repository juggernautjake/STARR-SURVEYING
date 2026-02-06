// app/admin/learn/manage/lesson-builder/[id]/page.tsx
'use client';
import { useState, useEffect, useRef, DragEvent, ChangeEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const TipTapEditor = dynamic(() => import('@/app/admin/components/TipTapEditor'), { ssr: false });

type BlockType = 'text' | 'image' | 'video' | 'callout' | 'divider' | 'quiz' | 'embed' | 'table' | 'file' | 'slideshow';

interface LessonBlock {
  id: string;
  block_type: BlockType;
  content: Record<string, any>;
  order_index: number;
}

interface LessonMeta {
  id: string;
  title: string;
  status: string;
  module_id: string;
  estimated_minutes: number;
}

const BLOCK_TYPES: { type: BlockType; label: string; icon: string; description: string }[] = [
  { type: 'text', label: 'Text', icon: 'T', description: 'Rich text with formatting' },
  { type: 'image', label: 'Image', icon: '🖼', description: 'Upload or link an image' },
  { type: 'video', label: 'Video', icon: '▶', description: 'YouTube/Vimeo embed or upload' },
  { type: 'callout', label: 'Callout', icon: '💡', description: 'Info, warning, or tip box' },
  { type: 'divider', label: 'Divider', icon: '—', description: 'Visual separator' },
  { type: 'quiz', label: 'Quiz', icon: '?', description: 'Inline quiz question' },
  { type: 'embed', label: 'Embed', icon: '⧉', description: 'External content via URL' },
  { type: 'table', label: 'Table', icon: '▦', description: 'Data table' },
  { type: 'file', label: 'File', icon: '📎', description: 'Downloadable attachment' },
  { type: 'slideshow', label: 'Slideshow', icon: '🎞', description: 'Image slideshow/carousel' },
];

function convertToEmbedUrl(url: string): string {
  if (!url) return '';
  // YouTube: convert watch URLs to embed
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Vimeo: convert standard URLs to embed
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return url;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function LessonBuilderPage() {
  const params = useParams();
  const lessonId = params.id as string;
  const [lesson, setLesson] = useState<LessonMeta | null>(null);
  const [blocks, setBlocks] = useState<LessonBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [insertIdx, setInsertIdx] = useState<number | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [isDraft, setIsDraft] = useState(true);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [slideshowIndexes, setSlideshowIndexes] = useState<Record<string, number>>({});
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileUploadTarget, setFileUploadTarget] = useState<{ blockId: string; field: string } | null>(null);

  useEffect(() => {
    loadLesson();
  }, [lessonId]);

  // Auto-save every 30 seconds
  useEffect(() => {
    autoSaveTimer.current = setInterval(() => {
      if (blocks.length > 0 && !saving) {
        saveBlocks(true);
      }
    }, 30000);
    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    };
  }, [blocks, saving]);

  async function loadLesson() {
    setLoading(true);
    try {
      const [lessonRes, blocksRes] = await Promise.all([
        fetch(`/api/admin/learn/lessons?id=${lessonId}`),
        fetch(`/api/admin/learn/lesson-blocks?lesson_id=${lessonId}`),
      ]);
      if (lessonRes.ok) {
        const data = await lessonRes.json();
        setLesson(data.lesson || null);
        setIsDraft(data.lesson?.status === 'draft');
      }
      if (blocksRes.ok) {
        const data = await blocksRes.json();
        setBlocks((data.blocks || []).sort((a: LessonBlock, b: LessonBlock) => a.order_index - b.order_index));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function saveBlocks(isAutoSave = false) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/learn/lesson-blocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: lessonId,
          blocks: blocks.map((b, i) => ({ ...b, order_index: i })),
        }),
      });
      if (res.ok) {
        setLastSaved(new Date().toLocaleTimeString());
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function togglePublish() {
    const newStatus = isDraft ? 'published' : 'draft';
    try {
      const res = await fetch('/api/admin/learn/lessons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lessonId, status: newStatus }),
      });
      if (res.ok) setIsDraft(!isDraft);
    } catch { /* ignore */ }
  }

  function addBlock(type: BlockType) {
    const idx = insertIdx !== null ? insertIdx : blocks.length;
    const defaultContent = getDefaultContent(type);
    const newBlock: LessonBlock = {
      id: `temp-${Date.now()}`,
      block_type: type,
      content: defaultContent,
      order_index: idx,
    };
    const updated = [...blocks];
    updated.splice(idx, 0, newBlock);
    setBlocks(updated.map((b, i) => ({ ...b, order_index: i })));
    setShowBlockPicker(false);
    setInsertIdx(null);
    setSelectedBlockId(newBlock.id);
  }

  function getDefaultContent(type: BlockType): Record<string, any> {
    switch (type) {
      case 'text': return { html: '<p>Enter text here...</p>' };
      case 'image': return { url: '', alt: '', caption: '', alignment: 'center' };
      case 'video': return { url: '', type: 'youtube', caption: '' };
      case 'callout': return { type: 'info', text: 'Important information here.' };
      case 'divider': return {};
      case 'quiz': return { question: '', options: ['', ''], correct: 0, explanation: '' };
      case 'embed': return { url: '', height: 400 };
      case 'table': return { headers: ['Column 1', 'Column 2'], rows: [['', '']] };
      case 'file': return { url: '', name: '', size: 0, type: '' };
      case 'slideshow': return { images: [{ url: '', alt: '', caption: '' }] };
      default: return {};
    }
  }

  function removeBlock(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id).map((b, i) => ({ ...b, order_index: i })));
    if (selectedBlockId === id) setSelectedBlockId(null);
  }

  function moveBlock(id: string, direction: 'up' | 'down') {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === blocks.length - 1) return;
    const newBlocks = [...blocks];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newBlocks[idx], newBlocks[swapIdx]] = [newBlocks[swapIdx], newBlocks[idx]];
    setBlocks(newBlocks.map((b, i) => ({ ...b, order_index: i })));
  }

  function duplicateBlock(id: string) {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const orig = blocks[idx];
    const copy: LessonBlock = {
      id: `temp-${Date.now()}`,
      block_type: orig.block_type,
      content: JSON.parse(JSON.stringify(orig.content)),
      order_index: idx + 1,
    };
    const updated = [...blocks];
    updated.splice(idx + 1, 0, copy);
    setBlocks(updated.map((b, i) => ({ ...b, order_index: i })));
    setSelectedBlockId(copy.id);
  }

  function updateBlockContent(id: string, content: Record<string, any>) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b));
  }

  // File handling via browser FileReader (converts to base64 data URL)
  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !fileUploadTarget) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const block = blocks.find(b => b.id === fileUploadTarget.blockId);
      if (!block) return;

      if (fileUploadTarget.field === 'slideshow-add') {
        const images = [...(block.content.images || []), { url: dataUrl, alt: file.name, caption: '' }];
        updateBlockContent(block.id, { ...block.content, images });
      } else if (fileUploadTarget.field === 'file') {
        updateBlockContent(block.id, { ...block.content, url: dataUrl, name: file.name, size: file.size, type: file.type });
      } else {
        updateBlockContent(block.id, { ...block.content, [fileUploadTarget.field]: dataUrl });
      }
      setFileUploadTarget(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function triggerFileUpload(blockId: string, field: string, accept?: string) {
    setFileUploadTarget({ blockId, field });
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept || 'image/*';
      fileInputRef.current.click();
    }
  }

  // Drag-and-drop handler for image blocks
  function handleDrop(e: DragEvent<HTMLDivElement>, blockId: string, field: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverBlockId(null);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const block = blocks.find(b => b.id === blockId);
      if (!block) return;
      if (field === 'slideshow-add') {
        const images = [...(block.content.images || []), { url: dataUrl, alt: file.name, caption: '' }];
        updateBlockContent(blockId, { ...block.content, images });
      } else {
        updateBlockContent(blockId, { ...block.content, [field]: dataUrl });
      }
    };
    reader.readAsDataURL(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, blockId: string) {
    e.preventDefault();
    setDragOverBlockId(blockId);
  }

  function handleDragLeave() {
    setDragOverBlockId(null);
  }

  // Slideshow navigation
  function slideshowNav(blockId: string, dir: 'prev' | 'next', total: number) {
    setSlideshowIndexes(prev => {
      const curr = prev[blockId] || 0;
      let next = dir === 'next' ? curr + 1 : curr - 1;
      if (next < 0) next = total - 1;
      if (next >= total) next = 0;
      return { ...prev, [blockId]: next };
    });
  }

  if (loading) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">⏳</div>
        <div className="admin-empty__title">Loading lesson builder...</div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">❌</div>
        <div className="admin-empty__title">Lesson not found</div>
        <Link href="/admin/learn/manage" className="admin-btn admin-btn--ghost">&larr; Back to Manage Content</Link>
      </div>
    );
  }

  return (
    <div className="lesson-builder">
      {/* Hidden file input for uploads */}
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelect} />

      {/* Builder Header */}
      <div className="lesson-builder__header">
        <div className="lesson-builder__header-left">
          <Link href="/admin/learn/manage" className="learn__back">&larr; Back to Manage</Link>
          <h2 className="lesson-builder__title">{lesson.title}</h2>
        </div>
        <div className="lesson-builder__header-right">
          <span className={`lesson-builder__status ${isDraft ? 'lesson-builder__status--draft' : 'lesson-builder__status--published'}`}>
            {isDraft ? 'Draft' : 'Published'}
          </span>
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={togglePublish}>
            {isDraft ? 'Publish' : 'Unpublish'}
          </button>
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setPreviewMode(!previewMode)}>
            {previewMode ? 'Edit' : 'Preview'}
          </button>
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => saveBlocks(false)} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {lastSaved && <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>Saved {lastSaved}</span>}
        </div>
      </div>

      {/* Preview Mode */}
      {previewMode ? (
        <div className="lesson__body">
          {blocks.map((block) => (
            <div key={block.id}>
              {block.block_type === 'text' && (
                <div dangerouslySetInnerHTML={{ __html: block.content.html || '' }} />
              )}
              {block.block_type === 'image' && block.content.url && (
                <figure style={{ textAlign: (block.content.alignment || 'center') as any, margin: '1.5rem 0' }}>
                  <img src={block.content.url} alt={block.content.alt || ''} style={{ maxWidth: '100%', borderRadius: '8px' }} />
                  {block.content.caption && <figcaption style={{ fontSize: '0.82rem', color: '#6B7280', marginTop: '0.5rem' }}>{block.content.caption}</figcaption>}
                </figure>
              )}
              {block.block_type === 'video' && block.content.url && (
                <div style={{ margin: '1.5rem 0' }}>
                  <iframe src={convertToEmbedUrl(block.content.url)} style={{ width: '100%', aspectRatio: '16/9', border: 'none', borderRadius: '8px' }} allowFullScreen />
                  {block.content.caption && <p style={{ fontSize: '0.82rem', color: '#6B7280', marginTop: '0.5rem', textAlign: 'center' }}>{block.content.caption}</p>}
                </div>
              )}
              {block.block_type === 'callout' && (
                <div className={`lesson-builder__callout lesson-builder__callout--${block.content.type || 'info'}`}>
                  {block.content.text}
                </div>
              )}
              {block.block_type === 'divider' && <hr style={{ border: 'none', borderTop: '2px solid #E5E7EB', margin: '2rem 0' }} />}
              {block.block_type === 'embed' && block.content.url && (
                <iframe src={block.content.url} style={{ width: '100%', height: `${block.content.height || 400}px`, border: '1px solid #E5E7EB', borderRadius: '8px', margin: '1.5rem 0' }} />
              )}
              {block.block_type === 'table' && (
                <div style={{ overflowX: 'auto', margin: '1.5rem 0' }}>
                  <table className="lesson-builder__preview-table">
                    <thead>
                      <tr>{(block.content.headers || []).map((h: string, i: number) => <th key={i}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {(block.content.rows || []).map((row: string[], ri: number) => (
                        <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {block.block_type === 'quiz' && (
                <div className="lesson-builder__callout lesson-builder__callout--info" style={{ margin: '1.5rem 0' }}>
                  <strong>Quiz: </strong>{block.content.question}
                  <div style={{ marginTop: '0.75rem' }}>
                    {(block.content.options || []).map((opt: string, i: number) => (
                      <div key={i} style={{ padding: '0.3rem 0', fontSize: '0.9rem' }}>
                        {String.fromCharCode(65 + i)}. {opt}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {block.block_type === 'file' && block.content.url && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: '#F8F9FA', borderRadius: '8px', margin: '1.5rem 0', border: '1px solid #E5E7EB' }}>
                  <span style={{ fontSize: '1.5rem' }}>📎</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{block.content.name || 'File'}</div>
                    {block.content.size > 0 && <div style={{ fontSize: '0.78rem', color: '#6B7280' }}>{formatFileSize(block.content.size)}</div>}
                  </div>
                  <a href={block.content.url} download={block.content.name} className="admin-btn admin-btn--ghost admin-btn--sm" style={{ marginLeft: 'auto' }}>Download</a>
                </div>
              )}
              {block.block_type === 'slideshow' && (block.content.images || []).length > 0 && (
                <div className="lesson-builder__slideshow-preview" style={{ margin: '1.5rem 0' }}>
                  {(() => {
                    const images = block.content.images || [];
                    const idx = slideshowIndexes[block.id] || 0;
                    const img = images[idx];
                    if (!img) return null;
                    return (
                      <div style={{ position: 'relative', textAlign: 'center' }}>
                        <img src={img.url} alt={img.alt || ''} style={{ maxWidth: '100%', maxHeight: '500px', borderRadius: '8px', objectFit: 'contain' }} />
                        {img.caption && <p style={{ fontSize: '0.82rem', color: '#6B7280', marginTop: '0.5rem' }}>{img.caption}</p>}
                        {images.length > 1 && (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => slideshowNav(block.id, 'prev', images.length)}>&larr;</button>
                            <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>{idx + 1} / {images.length}</span>
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => slideshowNav(block.id, 'next', images.length)}>&rarr;</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
          {blocks.length === 0 && (
            <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '3rem' }}>No content blocks yet. Switch to Edit mode to add blocks.</p>
          )}
        </div>
      ) : (
        /* Edit Mode */
        <div className="lesson-builder__canvas">
          {blocks.length === 0 && (
            <div className="lesson-builder__empty">
              <p>This lesson has no content blocks yet.</p>
              <button className="admin-btn admin-btn--primary" onClick={() => { setInsertIdx(0); setShowBlockPicker(true); }}>
                + Add First Block
              </button>
            </div>
          )}

          {blocks.map((block, idx) => (
            <div key={block.id} className={`lesson-builder__block ${selectedBlockId === block.id ? 'lesson-builder__block--selected' : ''}`} onClick={() => setSelectedBlockId(block.id)}>
              {/* Block Toolbar */}
              <div className="lesson-builder__block-toolbar">
                <span className="lesson-builder__block-type">{block.block_type}</span>
                <div className="lesson-builder__block-actions">
                  <button className="lesson-builder__block-btn" onClick={() => moveBlock(block.id, 'up')} disabled={idx === 0} title="Move up">↑</button>
                  <button className="lesson-builder__block-btn" onClick={() => moveBlock(block.id, 'down')} disabled={idx === blocks.length - 1} title="Move down">↓</button>
                  <button className="lesson-builder__block-btn" onClick={() => duplicateBlock(block.id)} title="Duplicate">⧉</button>
                  <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => removeBlock(block.id)} title="Remove">✕</button>
                </div>
              </div>

              {/* Block Editor Content */}
              <div className="lesson-builder__block-content">
                {block.block_type === 'text' && (
                  <TipTapEditor
                    content={block.content.html || ''}
                    onChange={(html: string) => updateBlockContent(block.id, { html })}
                  />
                )}

                {block.block_type === 'image' && (
                  <div className="lesson-builder__image-block">
                    <div
                      className={`lesson-builder__drop-zone ${dragOverBlockId === block.id ? 'lesson-builder__drop-zone--active' : ''}`}
                      onDragOver={e => handleDragOver(e, block.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, block.id, 'url')}
                      onClick={() => triggerFileUpload(block.id, 'url', 'image/*')}
                    >
                      {block.content.url ? (
                        <img src={block.content.url} alt={block.content.alt || ''} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '6px', objectFit: 'contain' }} />
                      ) : (
                        <div className="lesson-builder__drop-zone-text">
                          <span style={{ fontSize: '2rem' }}>🖼</span>
                          <p>Drag & drop an image here, or click to browse</p>
                          <p style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Or paste a URL below</p>
                        </div>
                      )}
                    </div>
                    <input className="fc-form__input" placeholder="Image URL (or upload above)" value={block.content.url?.startsWith('data:') ? '(uploaded file)' : block.content.url || ''} onChange={e => updateBlockContent(block.id, { ...block.content, url: e.target.value })} style={{ marginTop: '0.5rem' }} />
                    <input className="fc-form__input" placeholder="Alt text (for accessibility)" value={block.content.alt || ''} onChange={e => updateBlockContent(block.id, { ...block.content, alt: e.target.value })} style={{ marginTop: '0.5rem' }} />
                    <input className="fc-form__input" placeholder="Caption (optional)" value={block.content.caption || ''} onChange={e => updateBlockContent(block.id, { ...block.content, caption: e.target.value })} style={{ marginTop: '0.5rem' }} />
                    <select className="fc-form__input" value={block.content.alignment || 'center'} onChange={e => updateBlockContent(block.id, { ...block.content, alignment: e.target.value })} style={{ marginTop: '0.5rem' }}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                )}

                {block.block_type === 'video' && (
                  <div>
                    <input className="fc-form__input" placeholder="YouTube or Vimeo URL (e.g. https://youtube.com/watch?v=...)" value={block.content.url || ''} onChange={e => updateBlockContent(block.id, { ...block.content, url: e.target.value })} />
                    <input className="fc-form__input" placeholder="Caption (optional)" value={block.content.caption || ''} onChange={e => updateBlockContent(block.id, { ...block.content, caption: e.target.value })} style={{ marginTop: '0.5rem' }} />
                    {block.content.url && (
                      <div style={{ marginTop: '0.75rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                        <iframe
                          src={convertToEmbedUrl(block.content.url)}
                          style={{ width: '100%', aspectRatio: '16/9', border: 'none' }}
                          allowFullScreen
                          title="Video preview"
                        />
                      </div>
                    )}
                  </div>
                )}

                {block.block_type === 'callout' && (
                  <div>
                    <select className="fc-form__input" value={block.content.type || 'info'} onChange={e => updateBlockContent(block.id, { ...block.content, type: e.target.value })} style={{ marginBottom: '0.5rem' }}>
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="tip">Tip</option>
                      <option value="danger">Danger</option>
                    </select>
                    <textarea className="fc-form__textarea" value={block.content.text || ''} onChange={e => updateBlockContent(block.id, { ...block.content, text: e.target.value })} rows={3} placeholder="Callout text..." />
                    <div className={`lesson-builder__callout lesson-builder__callout--${block.content.type || 'info'}`} style={{ marginTop: '0.5rem' }}>
                      {block.content.text || 'Preview...'}
                    </div>
                  </div>
                )}

                {block.block_type === 'divider' && (
                  <hr style={{ border: 'none', borderTop: '2px dashed #D1D5DB', margin: '0.5rem 0' }} />
                )}

                {block.block_type === 'quiz' && (
                  <div>
                    <input className="fc-form__input" placeholder="Question" value={block.content.question || ''} onChange={e => updateBlockContent(block.id, { ...block.content, question: e.target.value })} />
                    <div style={{ marginTop: '0.5rem' }}>
                      {(block.content.options || []).map((opt: string, oi: number) => (
                        <div key={oi} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem', alignItems: 'center' }}>
                          <input
                            type="radio"
                            name={`quiz-${block.id}`}
                            checked={block.content.correct === oi}
                            onChange={() => updateBlockContent(block.id, { ...block.content, correct: oi })}
                          />
                          <input className="fc-form__input" value={opt} onChange={e => {
                            const opts = [...(block.content.options || [])];
                            opts[oi] = e.target.value;
                            updateBlockContent(block.id, { ...block.content, options: opts });
                          }} placeholder={`Option ${oi + 1}`} style={{ flex: 1 }} />
                          {(block.content.options || []).length > 2 && (
                            <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => {
                              const opts = (block.content.options || []).filter((_: any, i: number) => i !== oi);
                              const correct = block.content.correct >= opts.length ? opts.length - 1 : block.content.correct;
                              updateBlockContent(block.id, { ...block.content, options: opts, correct });
                            }}>✕</button>
                          )}
                        </div>
                      ))}
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                        const opts = [...(block.content.options || []), ''];
                        updateBlockContent(block.id, { ...block.content, options: opts });
                      }}>+ Add Option</button>
                    </div>
                    <textarea className="fc-form__textarea" placeholder="Explanation (shown after answer)" value={block.content.explanation || ''} onChange={e => updateBlockContent(block.id, { ...block.content, explanation: e.target.value })} rows={2} style={{ marginTop: '0.5rem' }} />
                  </div>
                )}

                {block.block_type === 'embed' && (
                  <div>
                    <input className="fc-form__input" placeholder="Embed URL" value={block.content.url || ''} onChange={e => updateBlockContent(block.id, { ...block.content, url: e.target.value })} />
                    <input className="fc-form__input" type="number" placeholder="Height (px)" value={block.content.height || 400} onChange={e => updateBlockContent(block.id, { ...block.content, height: parseInt(e.target.value) || 400 })} style={{ marginTop: '0.5rem', maxWidth: '150px' }} />
                    {block.content.url && (
                      <iframe src={block.content.url} style={{ width: '100%', height: `${block.content.height || 400}px`, border: '1px solid #E5E7EB', borderRadius: '8px', marginTop: '0.75rem' }} title="Embed preview" />
                    )}
                  </div>
                )}

                {block.block_type === 'table' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {(block.content.headers || []).map((h: string, hi: number) => (
                            <th key={hi} style={{ padding: '0.4rem', border: '1px solid #E5E7EB' }}>
                              <input className="fc-form__input" value={h} onChange={e => {
                                const headers = [...(block.content.headers || [])];
                                headers[hi] = e.target.value;
                                updateBlockContent(block.id, { ...block.content, headers });
                              }} style={{ fontWeight: 600 }} />
                            </th>
                          ))}
                          <th style={{ width: '40px' }}>
                            <button className="lesson-builder__block-btn" onClick={() => {
                              const headers = [...(block.content.headers || []), `Col ${(block.content.headers || []).length + 1}`];
                              const rows = (block.content.rows || []).map((r: string[]) => [...r, '']);
                              updateBlockContent(block.id, { ...block.content, headers, rows });
                            }}>+</button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(block.content.rows || []).map((row: string[], ri: number) => (
                          <tr key={ri}>
                            {row.map((cell: string, ci: number) => (
                              <td key={ci} style={{ padding: '0.4rem', border: '1px solid #E5E7EB' }}>
                                <input className="fc-form__input" value={cell} onChange={e => {
                                  const rows = [...(block.content.rows || [])];
                                  rows[ri] = [...rows[ri]];
                                  rows[ri][ci] = e.target.value;
                                  updateBlockContent(block.id, { ...block.content, rows });
                                }} />
                              </td>
                            ))}
                            <td style={{ width: '40px' }}>
                              <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => {
                                const rows = (block.content.rows || []).filter((_: any, i: number) => i !== ri);
                                updateBlockContent(block.id, { ...block.content, rows });
                              }}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{ marginTop: '0.5rem' }} onClick={() => {
                      const colCount = (block.content.headers || []).length;
                      const rows = [...(block.content.rows || []), new Array(colCount).fill('')];
                      updateBlockContent(block.id, { ...block.content, rows });
                    }}>+ Add Row</button>
                  </div>
                )}

                {block.block_type === 'file' && (
                  <div>
                    <div
                      className={`lesson-builder__drop-zone ${dragOverBlockId === block.id ? 'lesson-builder__drop-zone--active' : ''}`}
                      onDragOver={e => handleDragOver(e, block.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => {
                        e.preventDefault();
                        setDragOverBlockId(null);
                        const files = e.dataTransfer.files;
                        if (!files || files.length === 0) return;
                        const file = files[0];
                        const reader = new FileReader();
                        reader.onload = () => {
                          updateBlockContent(block.id, { ...block.content, url: reader.result as string, name: file.name, size: file.size, type: file.type });
                        };
                        reader.readAsDataURL(file);
                      }}
                      onClick={() => triggerFileUpload(block.id, 'file', '*/*')}
                      style={{ minHeight: '80px' }}
                    >
                      {block.content.url ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>📎</span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{block.content.name || 'Uploaded file'}</div>
                            {block.content.size > 0 && <div style={{ fontSize: '0.78rem', color: '#6B7280' }}>{formatFileSize(block.content.size)}</div>}
                          </div>
                        </div>
                      ) : (
                        <div className="lesson-builder__drop-zone-text">
                          <span style={{ fontSize: '2rem' }}>📎</span>
                          <p>Drag & drop a file here, or click to browse</p>
                        </div>
                      )}
                    </div>
                    <input className="fc-form__input" placeholder="Or enter file URL" value={block.content.url?.startsWith('data:') ? '(uploaded file)' : block.content.url || ''} onChange={e => updateBlockContent(block.id, { ...block.content, url: e.target.value })} style={{ marginTop: '0.5rem' }} />
                    <input className="fc-form__input" placeholder="Display name" value={block.content.name || ''} onChange={e => updateBlockContent(block.id, { ...block.content, name: e.target.value })} style={{ marginTop: '0.5rem' }} />
                  </div>
                )}

                {block.block_type === 'slideshow' && (
                  <div>
                    <div className="lesson-builder__slideshow-images">
                      {(block.content.images || []).map((img: any, ii: number) => (
                        <div key={ii} className="lesson-builder__slideshow-item">
                          <div className="lesson-builder__slideshow-thumb">
                            {img.url ? (
                              <img src={img.url} alt={img.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }} />
                            ) : (
                              <div
                                className={`lesson-builder__drop-zone ${dragOverBlockId === `${block.id}-${ii}` ? 'lesson-builder__drop-zone--active' : ''}`}
                                onDragOver={e => { e.preventDefault(); setDragOverBlockId(`${block.id}-${ii}`); }}
                                onDragLeave={handleDragLeave}
                                onDrop={e => {
                                  e.preventDefault();
                                  setDragOverBlockId(null);
                                  const files = e.dataTransfer.files;
                                  if (!files || files.length === 0) return;
                                  const file = files[0];
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    const images = [...(block.content.images || [])];
                                    images[ii] = { ...images[ii], url: reader.result as string, alt: file.name };
                                    updateBlockContent(block.id, { ...block.content, images });
                                  };
                                  reader.readAsDataURL(file);
                                }}
                                onClick={() => {
                                  setFileUploadTarget({ blockId: block.id, field: `slideshow-${ii}` });
                                  if (fileInputRef.current) {
                                    fileInputRef.current.accept = 'image/*';
                                    fileInputRef.current.click();
                                  }
                                }}
                                style={{ width: '100%', height: '100%', minHeight: '80px' }}
                              >
                                <div className="lesson-builder__drop-zone-text" style={{ padding: '0.5rem' }}>
                                  <span>🖼</span>
                                  <p style={{ fontSize: '0.72rem' }}>Drop image</p>
                                </div>
                              </div>
                            )}
                          </div>
                          <input className="fc-form__input" placeholder={`Slide ${ii + 1} URL`} value={img.url?.startsWith('data:') ? '(uploaded)' : img.url || ''} onChange={e => {
                            const images = [...(block.content.images || [])];
                            images[ii] = { ...images[ii], url: e.target.value };
                            updateBlockContent(block.id, { ...block.content, images });
                          }} style={{ fontSize: '0.78rem' }} />
                          <input className="fc-form__input" placeholder="Caption" value={img.caption || ''} onChange={e => {
                            const images = [...(block.content.images || [])];
                            images[ii] = { ...images[ii], caption: e.target.value };
                            updateBlockContent(block.id, { ...block.content, images });
                          }} style={{ fontSize: '0.78rem' }} />
                          <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => {
                            const images = (block.content.images || []).filter((_: any, i: number) => i !== ii);
                            updateBlockContent(block.id, { ...block.content, images });
                          }} style={{ alignSelf: 'flex-start' }}>✕</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                        const images = [...(block.content.images || []), { url: '', alt: '', caption: '' }];
                        updateBlockContent(block.id, { ...block.content, images });
                      }}>+ Add Slide (URL)</button>
                      <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => triggerFileUpload(block.id, 'slideshow-add', 'image/*')}>
                        + Upload Image
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Insert point between blocks */}
              <div className="lesson-builder__insert-point">
                <button className="lesson-builder__insert-btn" onClick={() => { setInsertIdx(idx + 1); setShowBlockPicker(true); }}>
                  + Add Block
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Block Picker Modal */}
      {showBlockPicker && (
        <div className="admin-modal-overlay" onClick={() => setShowBlockPicker(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Add Content Block</h3>
              <button className="admin-modal__close" onClick={() => setShowBlockPicker(false)}>✕</button>
            </div>
            <div className="admin-modal__body">
              <div className="lesson-builder__block-picker">
                {BLOCK_TYPES.map((bt) => (
                  <button key={bt.type} className="lesson-builder__block-option" onClick={() => addBlock(bt.type)}>
                    <span className="lesson-builder__block-option-icon">{bt.icon}</span>
                    <div>
                      <div className="lesson-builder__block-option-label">{bt.label}</div>
                      <div className="lesson-builder__block-option-desc">{bt.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
