'use client';
// app/ux-harness/SplitHarnessMount.tsx — run the in-browser video/audio splitter on a real file.
//
// Owner, 2026-10-06: "I have multiple videos over 5 minutes that do not seem to be able to be
// uploaded or even split up." This page cuts a picked file into parts with exactly the code the
// upload pop-up uses (lib/jobs/video-split*.ts), so a long phone video can be tested end to end.
import { useState } from 'react';
import { planSplit, DEFAULT_PART_MINUTES } from '@/lib/jobs/video-split';
import { readVideoDuration, splitVideo } from '@/lib/jobs/video-split-run';

export default function SplitHarnessMount(): React.ReactElement {
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => setLog((l) => [...l, s]);
  async function run(file: File) {
    setLog([]);
    add(`picked ${file.name}, ${Math.round(file.size / 1048576)} MB`);
    const dur = await readVideoDuration(file);
    add(`duration ${dur?.toFixed(1)} s`);
    const plan = planSplit({ sizeBytes: file.size, durationSec: dur, capBytes: 500 * 1048576, name: file.name, maxPartSeconds: DEFAULT_PART_MINUTES * 60, force: true });
    add(`plan: ${plan.parts.length} parts`);
    const t0 = performance.now();
    const out = await splitVideo(file, plan.parts, undefined, (f, i, n) => add(`part ${i}/${n}: ${f.name} ${Math.round(f.size / 1048576)} MB`));
    add(out.ok ? `DONE ${out.files?.length} parts in ${Math.round((performance.now() - t0) / 1000)} s` : `FAILED: ${out.error}`);
  }
  return (
    <div style={{ padding: 16 }}>
      <input type="file" accept="video/*,audio/*" data-testid="split-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); }} />
      <pre data-testid="split-log">{log.join('\n')}</pre>
    </div>
  );
}
