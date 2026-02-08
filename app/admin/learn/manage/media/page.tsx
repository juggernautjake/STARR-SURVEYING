// app/admin/learn/manage/media/page.tsx — Media Library Management
'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface MediaItem {
  id: string; title: string; caption?: string; media_type: string; url: string;
  alt_text?: string; link_url?: string; is_clickable: boolean; resolution?: string;
  tags: string[]; uploaded_by: string; source_context?: string; source_id?: string;
  created_at: string; deleted_at?: string;
}

type FilterType = 'all' | 'image' | 'video' | 'audio' | 'document' | 'url';

export default function MediaLibraryPage() {
  const router = useRouter();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [editItem, setEditItem] = useState<MediaItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload form state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadType, setUploadType] = useState<string>('image');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadAlt, setUploadAlt] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadLinkUrl, setUploadLinkUrl] = useState('');
  const [uploadClickable, setUploadClickable] = useState(false);
  const [uploadResolution, setUploadResolution] = useState('original');
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => { fetchMedia(); }, [filter, search]);

  async function fetchMedia() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('type', filter);
    if (search) params.set('search', search);
    try {
      const res = await fetch(`/api/admin/media?${params}`);
      const data = await res.json();
      setMedia(data.media || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadTitle(file.name.replace(/\.[^.]+$/, ''));
    // Detect media type
    if (file.type.startsWith('image/')) setUploadType('image');
    else if (file.type.startsWith('video/')) setUploadType('video');
    else if (file.type.startsWith('audio/')) setUploadType('audio');
    else setUploadType('document');
    // Read as data URL for preview
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUploadUrl(dataUrl);
      setPreviewUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function submitUpload() {
    if (!uploadUrl && !uploadTitle) return;
    setUploading(true);
    try {
      const res = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: uploadTitle || 'Untitled',
          caption: uploadCaption || null,
          media_type: uploadType,
          url: uploadUrl.startsWith('data:') ? undefined : uploadUrl,
          data_url: uploadUrl.startsWith('data:') ? uploadUrl : undefined,
          alt_text: uploadAlt || null,
          link_url: uploadLinkUrl || null,
          is_clickable: uploadClickable,
          resolution: uploadResolution,
          tags: uploadTags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        resetUploadForm();
        setShowUpload(false);
        fetchMedia();
      }
    } catch { /* ignore */ }
    setUploading(false);
  }

  async function updateMedia() {
    if (!editItem) return;
    try {
      await fetch('/api/admin/media', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editItem.id,
          title: editItem.title,
          caption: editItem.caption,
          alt_text: editItem.alt_text,
          tags: editItem.tags,
          link_url: editItem.link_url,
          is_clickable: editItem.is_clickable,
          resolution: editItem.resolution,
        }),
      });
      setEditItem(null);
      fetchMedia();
    } catch { /* ignore */ }
  }

  async function deleteMedia(id: string, permanent = false) {
    const msg = permanent ? 'Permanently delete this item? This cannot be undone.' : 'Move this item to the recycle bin?';
    if (!confirm(msg)) return;
    await fetch(`/api/admin/media?id=${id}&permanent=${permanent}`, { method: 'DELETE' });
    fetchMedia();
  }

  function resetUploadForm() {
    setUploadTitle(''); setUploadCaption(''); setUploadType('image');
    setUploadUrl(''); setUploadAlt(''); setUploadTags('');
    setUploadLinkUrl(''); setUploadClickable(false); setUploadResolution('original');
    setPreviewUrl('');
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case 'image': return '\u{1F5BC}';
      case 'video': return '\u{1F3AC}';
      case 'audio': return '\u{1F3B5}';
      case 'document': return '\u{1F4C4}';
      case 'url': return '\u{1F517}';
      default: return '\u{1F4CE}';
    }
  }

  const filterTabs: [FilterType, string][] = [['all', 'All'], ['image', 'Images'], ['video', 'Videos'], ['audio', 'Audio'], ['document', 'Documents'], ['url', 'URLs']];

  return (
    <>
      <div className="learn__header">
        <button onClick={() => router.back()} className="learn__back" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>&larr; Back</button>
        <h2 className="learn__title">Media Library</h2>
        <p className="learn__subtitle">Manage all uploaded images, videos, audio files, and external URLs used across lessons, articles, and questions.</p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
          {filterTabs.map(([f, label]) => (
            <button key={f} className={`admin-kb__category-btn ${filter === f ? 'admin-kb__category-btn--active' : ''}`} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <input
            type="text" placeholder="Search media..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '.4rem .7rem', border: '1.5px solid #E5E7EB', borderRadius: 6, fontSize: '.85rem', width: 180 }}
          />
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => { resetUploadForm(); setShowUpload(true); }}>
            + Upload Media
          </button>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#FFF', borderRadius: 12, padding: '1.5rem', maxWidth: 600, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Upload Media</h3>

            {/* File input */}
            <div style={{ marginBottom: '1rem' }}>
              <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" onChange={handleFileSelect} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()} className="admin-btn admin-btn--secondary admin-btn--sm" style={{ marginRight: '.5rem' }}>Choose File</button>
              <span style={{ fontSize: '.82rem', color: '#6B7280' }}>or paste a URL below</span>
            </div>

            {previewUrl && uploadType === 'image' && (
              <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, border: '1px solid #E5E7EB' }} />
              </div>
            )}

            <div className="manage__form" style={{ gap: '.65rem' }}>
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 200px' }}>
                  <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>Title</label>
                  <input className="manage__form-input" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="Media title" />
                </div>
                <div style={{ flex: '0 0 140px' }}>
                  <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>Type</label>
                  <select className="manage__form-input" value={uploadType} onChange={e => setUploadType(e.target.value)} style={{ background: '#FFF' }}>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                    <option value="document">Document</option>
                    <option value="url">External URL</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>URL (or paste embed URL / YouTube link)</label>
                <input className="manage__form-input" value={uploadUrl.startsWith('data:') ? '(File selected)' : uploadUrl} onChange={e => { setUploadUrl(e.target.value); setPreviewUrl(e.target.value); }} placeholder="https://..." disabled={uploadUrl.startsWith('data:')} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>Caption</label>
                <textarea className="manage__form-textarea" value={uploadCaption} onChange={e => setUploadCaption(e.target.value)} rows={2} placeholder="Optional caption text" />
              </div>

              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>Alt Text</label>
                  <input className="manage__form-input" value={uploadAlt} onChange={e => setUploadAlt(e.target.value)} placeholder="Descriptive alt text" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>Tags (comma-separated)</label>
                  <input className="manage__form-input" value={uploadTags} onChange={e => setUploadTags(e.target.value)} placeholder="surveying, diagram" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '0 0 140px' }}>
                  <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>Resolution</label>
                  <select className="manage__form-input" value={uploadResolution} onChange={e => setUploadResolution(e.target.value)} style={{ background: '#FFF' }}>
                    <option value="original">Original</option>
                    <option value="thumbnail">Thumbnail (150px)</option>
                    <option value="small">Small (400px)</option>
                    <option value="medium">Medium (800px)</option>
                    <option value="large">Large (1200px)</option>
                    <option value="full">Full Width</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>Link URL (if clickable)</label>
                  <input className="manage__form-input" value={uploadLinkUrl} onChange={e => setUploadLinkUrl(e.target.value)} placeholder="https://..." />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.82rem', color: '#374151', cursor: 'pointer', marginBottom: '.35rem' }}>
                  <input type="checkbox" checked={uploadClickable} onChange={e => setUploadClickable(e.target.checked)} />
                  Clickable
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem' }}>
              <button className="admin-btn admin-btn--primary" onClick={submitUpload} disabled={uploading || (!uploadUrl && !previewUrl)}>
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <button className="admin-btn admin-btn--ghost" onClick={() => setShowUpload(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#FFF', borderRadius: 12, padding: '1.5rem', maxWidth: 500, width: '100%' }}>
            <h3 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Edit Media</h3>
            <div className="manage__form" style={{ gap: '.65rem' }}>
              <input className="manage__form-input" value={editItem.title} onChange={e => setEditItem({ ...editItem, title: e.target.value })} placeholder="Title" />
              <textarea className="manage__form-textarea" value={editItem.caption || ''} onChange={e => setEditItem({ ...editItem, caption: e.target.value })} placeholder="Caption" rows={2} />
              <input className="manage__form-input" value={editItem.alt_text || ''} onChange={e => setEditItem({ ...editItem, alt_text: e.target.value })} placeholder="Alt text" />
              <input className="manage__form-input" value={(editItem.tags || []).join(', ')} onChange={e => setEditItem({ ...editItem, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} placeholder="Tags (comma-separated)" />
            </div>
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem' }}>
              <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={updateMedia}>Save</button>
              <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditItem(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Media Grid */}
      {loading ? (
        <div className="admin-empty"><div className="admin-empty__icon">&#x23F3;</div><div className="admin-empty__title">Loading media...</div></div>
      ) : media.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">&#x1F5BC;</div>
          <div className="admin-empty__title">No media files yet</div>
          <div className="admin-empty__desc">Upload images, videos, or other files to use in lessons, articles, and questions.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
          {media.map(item => (
            <div key={item.id} style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', cursor: 'pointer' }}>
              <div style={{ height: 120, background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {item.media_type === 'image' && item.url ? (
                  <img src={item.url} alt={item.alt_text || item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '2.5rem' }}>{getTypeIcon(item.media_type)}</span>
                )}
              </div>
              <div style={{ padding: '.65rem' }}>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: '#0F1419', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                <div style={{ fontSize: '.72rem', color: '#9CA3AF', marginTop: '.15rem' }}>
                  {item.media_type} &middot; {new Date(item.created_at).toLocaleDateString()}
                </div>
                {item.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.15rem', marginTop: '.35rem' }}>
                    {item.tags.slice(0, 3).map(tag => (
                      <span key={tag} style={{ fontSize: '.6rem', padding: '1px 4px', background: '#F3F4F6', borderRadius: 3, color: '#6B7280' }}>{tag}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '.35rem', marginTop: '.5rem' }}>
                  <button onClick={() => setEditItem(item)} className="manage__item-btn" style={{ fontSize: '.68rem', padding: '.2rem .4rem' }}>Edit</button>
                  <button onClick={() => deleteMedia(item.id)} className="manage__item-btn manage__item-btn--danger" style={{ fontSize: '.68rem', padding: '.2rem .4rem' }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
