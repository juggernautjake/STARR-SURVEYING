// app/admin/components/messaging/UnderConstruction.tsx
'use client';

interface UnderConstructionProps {
  feature: string;
  description: string;
}

export default function UnderConstruction({ feature, description }: UnderConstructionProps) {
  return (
    <div className="msg-construction">
      <div className="msg-construction__icon">🚧</div>
      <h3 className="msg-construction__title">Under Construction</h3>
      <p className="msg-construction__feature">{feature}</p>
      <p className="msg-construction__desc">{description}</p>
      <div className="msg-construction__bar">
        <div className="msg-construction__bar-fill" />
      </div>
      <p className="msg-construction__note">Components below are being built. Some may not be fully functional yet.</p>
    </div>
  );
}
