// app/admin/profile/page.tsx
'use client';
import { useSession } from 'next-auth/react';

export default function ProfilePage() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  const { name, email, role, image } = session.user;
  return (
    <div style={{ maxWidth: '600px' }}>
      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          {image ? <img src={image} alt={name||'User'} style={{ width:64, height:64, borderRadius:'50%', border:'3px solid #E5E7EB' }}/> :
           <div style={{ width:64, height:64, borderRadius:'50%', background:'#BD1218', color:'#FFF', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Sora,sans-serif', fontSize:'1.25rem', fontWeight:700 }}>{(name||'U').charAt(0)}</div>}
          <div>
            <div style={{ fontFamily:'Sora,sans-serif', fontSize:'1.2rem', fontWeight:700, color:'#0F1419' }}>{name}</div>
            <div style={{ fontFamily:'Inter,sans-serif', fontSize:'.85rem', color:'#6B7280' }}>{email}</div>
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'.75rem' }}>
          <div><div className="admin-card__label">Role</div><span className={`admin-topbar__role-badge admin-topbar__role-badge--${role}`} style={{ display:'inline-flex' }}>{role}</span></div>
          <div><div className="admin-card__label">Authentication</div><div style={{ fontFamily:'Inter,sans-serif', fontSize:'.9rem', color:'#0F1419' }}>Google Workspace (@starr-surveying.com)</div></div>
        </div>
      </div>
    </div>
  );
}
