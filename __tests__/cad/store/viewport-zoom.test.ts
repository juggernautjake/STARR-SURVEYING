// __tests__/cad/store/viewport-zoom.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useViewportStore } from '@/lib/cad/store/viewport-store';

function setView(partial: Partial<ReturnType<typeof useViewportStore.getState>>) {
  useViewportStore.setState(partial as never);
}

describe('viewport zoomAt — cursor anchoring', () => {
  beforeEach(() => {
    setView({ zoom: 2, centerX: 100, centerY: 50, screenWidth: 800, screenHeight: 600 });
  });

  it('keeps the world point under the cursor fixed when zooming in', () => {
    const sx = 600, sy = 180; // off-center cursor
    const before = useViewportStore.getState().screenToWorld(sx, sy);
    useViewportStore.getState().zoomAt(sx, sy, 1.5);
    const after = useViewportStore.getState().screenToWorld(sx, sy);
    expect(after.wx).toBeCloseTo(before.wx, 6);
    expect(after.wy).toBeCloseTo(before.wy, 6);
    expect(useViewportStore.getState().zoom).toBeCloseTo(3, 6);
  });

  it('keeps the world point under the cursor fixed when zooming out', () => {
    const sx = 120, sy = 470;
    const before = useViewportStore.getState().screenToWorld(sx, sy);
    useViewportStore.getState().zoomAt(sx, sy, 1 / 1.5);
    const after = useViewportStore.getState().screenToWorld(sx, sy);
    expect(after.wx).toBeCloseTo(before.wx, 6);
    expect(after.wy).toBeCloseTo(before.wy, 6);
  });

  it('pans the view center toward an off-center cursor on zoom-in', () => {
    // Cursor to the right of center → center should move right (toward it).
    const before = useViewportStore.getState().centerX;
    useViewportStore.getState().zoomAt(700, 300, 1.5); // right of 400 center
    expect(useViewportStore.getState().centerX).toBeGreaterThan(before);
  });
});
