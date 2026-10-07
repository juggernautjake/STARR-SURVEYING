'use client';
// app/ux-harness/ScanHarnessMount.tsx — the Scan pop-up, open, talking to whatever Starr Scan helper
// is running on this computer (2026-10-06). Confirming logs the files instead of uploading them.
import { useState } from 'react';
import ScanDialog from '@/app/admin/components/scan/ScanDialog';

export default function ScanHarnessMount(): React.ReactElement {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState<string[]>([]);
  return (
    <div style={{ padding: 16 }}>
      <button type="button" onClick={() => setOpen(true)}>Scan</button>
      <ul data-testid="scan-harness-saved">{saved.map((s) => <li key={s}>{s}</li>)}</ul>
      <ScanDialog
        open={open}
        onClose={() => setOpen(false)}
        destinationLabel="Documents"
        onConfirm={(files) => { setSaved(files.map((f) => `${f.name} (${f.type}, ${f.size} bytes)`)); setOpen(false); }}
      />
    </div>
  );
}
