// worker/src/playbooks/drift.ts — diff a site observation against its playbook (plan B5).
//
// The drift watch's job is to notice when a site stops matching what the playbook says — a login
// wall where there was none, a results grid that renders differently, a repository that has started
// blocking us. This is the decision half: given an OBSERVATION of a site (did it answer, is there a
// captcha, was the done-signal seen, which egress reached it), it returns the ways the live site has
// drifted from its dossier. Gathering the observation (a plain fetch, or the atlas browser walk) and
// filing a health row from the findings are the integration half — they ride on B1's walk.

import type { Playbook } from './types.js';
import type { PlatEgress } from '../services/county-plats.js';
import type { CaptchaSignature } from '../research/captcha-signatures.js';

export interface SiteObservation {
  /** Did the entry URL answer at all. */
  reachable: boolean;
  httpStatus?: number | null;
  /** The captcha detected on the page, if any (from detectCaptcha). */
  captcha?: CaptchaSignature | null;
  /** Whether the playbook's done-signal was observed. null = not checked (e.g. an SPA needs the browser walk). */
  doneSignalSeen?: boolean | null;
  /** Which egress actually reached the site, when known. */
  egressUsed?: PlatEgress | null;
}

export interface DriftFinding {
  kind: 'unreachable' | 'captcha' | 'done-signal-missing' | 'egress-changed';
  detail: string;
}

/** Every way the observed site has drifted from its playbook. Pure. Empty = the dossier still holds. */
export function assessPlaybookDrift(pb: Playbook, obs: SiteObservation): DriftFinding[] {
  const out: DriftFinding[] = [];

  if (!obs.reachable) {
    out.push({ kind: 'unreachable', detail: `${pb.site} did not answer at ${pb.entryUrl}${obs.httpStatus ? ` (HTTP ${obs.httpStatus})` : ''}.` });
    return out; // nothing else can be judged if it did not answer
  }

  if (obs.captcha?.present) {
    out.push({
      kind: 'captcha',
      detail: `${pb.site} now shows a ${obs.captcha.kind}; the playbook recorded ${pb.captchaSignature ? `"${pb.captchaSignature}"` : 'no captcha'}.`,
    });
  }

  if (obs.doneSignalSeen === false) {
    out.push({
      kind: 'done-signal-missing',
      detail: `${pb.site}: the done-signal "${pb.doneSignal.signal}" (${pb.doneSignal.kind}) was not seen — the ${pb.doneSignal.kind === 'appears' ? 'results markup' : 'loading indicator'} may have changed.`,
    });
  }

  if (obs.egressUsed && obs.egressUsed !== pb.egress) {
    out.push({
      kind: 'egress-changed',
      detail: `${pb.site}: reached via ${obs.egressUsed}, but the playbook says ${pb.egress} — update the egress or the site has changed how it treats the worker.`,
    });
  }

  return out;
}

/** One line for the health row / run log. */
export function describeDrift(pb: Playbook, findings: DriftFinding[]): string {
  if (findings.length === 0) return `${pb.site} v${pb.version}: no drift — the live site still matches the playbook.`;
  return `${pb.site} v${pb.version} DRIFTED: ${findings.map((f) => f.detail).join(' ')}`;
}
