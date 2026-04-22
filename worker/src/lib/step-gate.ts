// worker/src/lib/step-gate.ts
// Step gate for interactive step-through debugging.
// When tracing is in step mode, __trace() calls await the gate.
// POST /research/step/:projectId advances one step.

interface PendingCheckpoint {
  label: string;
  resolve: () => void;
}

export class StepGate {
  private stepModeProjects = new Set<string>();
  private pendingCheckpoints = new Map<string, PendingCheckpoint>();

  // enableStepMode: called when execution mode='step' is sent to the run endpoint
  enableStepMode(projectId: string): void {
    this.stepModeProjects.add(projectId);
  }

  // disableStepMode: called when run completes or is stopped
  disableStepMode(projectId: string): void {
    this.stepModeProjects.delete(projectId);
    // Resolve any waiting checkpoint so the pipeline can finish cleanly
    const pending = this.pendingCheckpoints.get(projectId);
    if (pending) {
      this.pendingCheckpoints.delete(projectId);
      pending.resolve();
    }
  }

  // isStepMode: true when this project is in step-through mode
  isStepMode(projectId: string): boolean {
    return this.stepModeProjects.has(projectId);
  }

  // addCheckpoint: call from __trace() when step mode is active — returns a promise
  // that resolves when the user clicks "Next Step"
  async addCheckpoint(projectId: string, label: string): Promise<void> {
    // If there's already a pending checkpoint (shouldn't happen in normal flow),
    // resolve it before registering a new one so execution doesn't deadlock.
    const existing = this.pendingCheckpoints.get(projectId);
    if (existing) {
      this.pendingCheckpoints.delete(projectId);
      existing.resolve();
    }

    return new Promise<void>((resolve) => {
      this.pendingCheckpoints.set(projectId, { label, resolve });
    });
  }

  // advance: called by POST /research/step/:projectId — resolves the next waiting checkpoint
  // Returns true if there was a waiting checkpoint, false otherwise
  advance(projectId: string): boolean {
    const pending = this.pendingCheckpoints.get(projectId);
    if (!pending) return false;

    this.pendingCheckpoints.delete(projectId);
    pending.resolve();
    return true;
  }

  // getCurrentCheckpoint: returns the label of the currently paused checkpoint, or null
  getCurrentCheckpoint(projectId: string): string | null {
    return this.pendingCheckpoints.get(projectId)?.label ?? null;
  }
}

export const globalStepGate = new StepGate();
