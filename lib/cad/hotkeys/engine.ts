// lib/cad/hotkeys/engine.ts
//
// Phase 8 §2.2 — hotkey engine. Consumes a stream of
// normalized KeyboardEvents and dispatches matched actions
// via a callback.
//
// State machine:
//   * Each `BindableAction.defaultKey` is a sequence of
//     steps (single-key for non-chords; multi-step for
//     chords). The engine builds a prefix tree once at
//     construction.
//   * `handleKeyEvent(event)` walks the tree:
//       - Modifier-only events (Shift / Ctrl / Alt / Meta
//         press alone) are ignored — they don't advance
//         the buffer and don't reset it.
//       - A step that lands on a leaf (action with no
//         further children) fires the action immediately
//         via `onAction`.
//       - A step that lands on a node with both an action
//         AND children (e.g. `p` is bound to `tool.point`
//         AND prefixes `p l`, `p g`) buffers the action
//         and arms a timer. Pressing the next chord step
//         within `chordTimeoutMs` extends the chord and
//         cancels the buffered fire; letting the timer
//         expire fires the buffered action.
//       - A step that's a prefix-only (no action at this
//         node, but children exist) buffers and waits for
//         the next step.
//       - A step that doesn't match resets the buffer and
//         re-tries the step against the root, so a stale
//         partial chord recovers cleanly when the user
//         types a fresh sequence.
//   * Chord timeout — if no key arrives within
//     `chordTimeoutMs` (default 1000) the buffered action
//     fires (or the buffer just clears when no action was
//     buffered).
//   * Context filtering — `getContext()` returns the active
//     `ActionContext`; only actions whose context is
//     GLOBAL or matches the current context fire.
//
// Pure: timers go through pluggable `setTimer` / `clearTimer`
// so tests can swap in fakes. Defaults to `globalThis.setTimeout`
// / `clearTimeout` when not supplied.

import { normalizeKeyboardEvent, normalizeBindingString } from './key-format';
import type {
  ActionContext,
  BindableAction,
  UserBinding,
} from './types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface HotkeyEngineConfig {
  /** Source of truth for all bindable actions. Usually the
   *  full registry. */
  actions:        ReadonlyArray<BindableAction>;
  /** Optional per-action override (user-customized
   *  bindings). The engine merges these onto the defaults
   *  at construction time. */
  userBindings?: ReadonlyArray<UserBinding>;
  /** Returns the active context. The engine ignores actions
   *  whose context !== GLOBAL && !== getContext(). */
  getContext?: () => ActionContext;
  /** Auto-reset / auto-fire the chord buffer after this
   *  many ms of inactivity. Default 1000. */
  chordTimeoutMs?: number;
  /** Caller-side dispatch — fires when the engine resolves
   *  a binding to an action. */
  onAction: (action: BindableAction, key: string) => void;
  /** Timer functions — allow tests to swap fakes. Default
   *  to `globalThis.setTimeout` / `clearTimeout`. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface HotkeyEngine {
  /** Process a single key event. Returns true when the
   *  engine consumed it (matched, prefix-buffered, or
   *  modifier-only) so the caller can decide whether to
   *  preventDefault. Returns false on a clean miss. */
  handleKeyEvent: (
    event: Pick<
      KeyboardEvent,
      'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'
    >
  ) => boolean;
  /** Force-clear the chord buffer (e.g. on tool change). */
  resetBuffer: () => void;
  /** Diagnostic — current buffered chord prefix. Empty when
   *  no chord is in progress. */
  getBufferedPrefix: () => string;
  /** Force-fire any pending buffered action immediately
   *  (e.g. on blur). No-op when nothing is buffered. */
  flushPending: () => void;
  /** Update the user-binding overrides without recreating
   *  the engine. Common after the settings page lands. */
  setUserBindings: (bindings: ReadonlyArray<UserBinding>) => void;
}

// ────────────────────────────────────────────────────────────
// Internals — prefix tree
// ────────────────────────────────────────────────────────────

interface TreeNode {
  /** Action that fires at this exact key sequence. */
  action: BindableAction | null;
  /** Children keyed by the next step token. */
  children: Map<string, TreeNode>;
}

function emptyNode(): TreeNode {
  return { action: null, children: new Map() };
}

function insertBinding(
  root: TreeNode,
  canonicalKey: string,
  action: BindableAction
): void {
  const steps = canonicalKey.split(' ').filter(Boolean);
  if (steps.length === 0) return;
  let node = root;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    let next = node.children.get(step);
    if (!next) {
      next = emptyNode();
      node.children.set(step, next);
    }
    node = next;
    if (i === steps.length - 1) {
      node.action = action;
    }
  }
}

function buildTree(
  actions: ReadonlyArray<BindableAction>,
  userBindings: ReadonlyArray<UserBinding>
): TreeNode {
  const overrideById = new Map<string, string | null>();
  for (const ub of userBindings) {
    overrideById.set(ub.actionId, ub.key);
  }
  const root = emptyNode();
  for (const action of actions) {
    const override = overrideById.get(action.id);
    const rawKey =
      override === undefined ? action.defaultKey : override;
    if (!rawKey) continue;
    const normalized = normalizeBindingString(rawKey);
    if (!normalized) continue;
    insertBinding(root, normalized, action);
  }
  return root;
}

// ────────────────────────────────────────────────────────────
// Public factory
// ────────────────────────────────────────────────────────────

export function createHotkeyEngine(
  config: HotkeyEngineConfig
): HotkeyEngine {
  const chordTimeoutMs = config.chordTimeoutMs ?? 1000;
  const getContext = config.getContext ?? (() => 'GLOBAL' as ActionContext);
  const setTimer =
    config.setTimer ??
    ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const clearTimer =
    config.clearTimer ??
    ((handle: unknown) =>
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));
  let userBindings: ReadonlyArray<UserBinding> = config.userBindings ?? [];
  let root = buildTree(config.actions, userBindings);
  let cursor = root;
  let bufferedSteps: string[] = [];
  let pendingAction: BindableAction | null = null;
  let pendingTimer: unknown = null;

  function rebuildTree(): void {
    cancelPending();
    root = buildTree(config.actions, userBindings);
    cursor = root;
    bufferedSteps = [];
  }

  function cancelPending(): void {
    if (pendingTimer !== null) {
      clearTimer(pendingTimer);
      pendingTimer = null;
    }
    pendingAction = null;
  }

  function reset(): void {
    cancelPending();
    cursor = root;
    bufferedSteps = [];
  }

  function fireAction(action: BindableAction): void {
    const context = getContext();
    reset();
    if (action.context !== 'GLOBAL' && action.context !== context) return;
    config.onAction(action, action.defaultKey ?? '');
  }

  function flushPending(): void {
    if (pendingAction) {
      const action = pendingAction;
      fireAction(action);
    } else {
      reset();
    }
  }

  function armPendingFire(action: BindableAction): void {
    cancelPending();
    pendingAction = action;
    pendingTimer = setTimer(() => {
      pendingTimer = null;
      flushPending();
    }, chordTimeoutMs);
  }

  function tryStep(step: string):
    | { kind: 'leaf'; action: BindableAction }
    | { kind: 'ambiguous'; action: BindableAction }
    | { kind: 'prefix' }
    | { kind: 'miss' } {
    const next = cursor.children.get(step);
    if (!next) return { kind: 'miss' };
    cursor = next;
    bufferedSteps.push(step);
    if (next.action && next.children.size === 0) {
      return { kind: 'leaf', action: next.action };
    }
    if (next.action && next.children.size > 0) {
      return { kind: 'ambiguous', action: next.action };
    }
    return { kind: 'prefix' };
  }

  function handleKeyEvent(
    event: Pick<
      KeyboardEvent,
      'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'
    >
  ): boolean {
    const norm = normalizeKeyboardEvent(event);
    if (norm.isModifierOnly) return true;
    if (!norm.key) return false;

    // If a chord is buffered (or a pending action is armed)
    // and the new step doesn't extend the current cursor,
    // resolve the pending fire (if any) before starting
    // fresh from the root.
    let result = tryStep(norm.key);
    if (result.kind === 'miss' && cursor !== root) {
      const carriedPending = pendingAction;
      reset();
      // The buffered prefix-with-action fires on a non-
      // extending follow-up too — same UX as the timer
      // expiring.
      if (carriedPending) fireAction(carriedPending);
      result = tryStep(norm.key);
    }

    if (result.kind === 'miss') {
      reset();
      return false;
    }

    if (result.kind === 'prefix') {
      // Prefix-only — nothing to fire yet; clear any prior
      // pending (the new buffer subsumes it).
      cancelPending();
      return true;
    }

    if (result.kind === 'leaf') {
      fireAction(result.action);
      return true;
    }

    // Ambiguous: this step both completes a binding AND is
    // a prefix for longer chords. Arm a pending fire and
    // wait for either the next key (extends chord) or the
    // timer (fires the buffered action).
    armPendingFire(result.action);
    return true;
  }

  return {
    handleKeyEvent,
    resetBuffer: reset,
    getBufferedPrefix: () => bufferedSteps.join(' '),
    flushPending,
    setUserBindings: (bindings) => {
      userBindings = bindings;
      rebuildTree();
    },
  };
}
