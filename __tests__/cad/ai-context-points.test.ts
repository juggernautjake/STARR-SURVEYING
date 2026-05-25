import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, type ProjectContext } from '@/lib/cad/ai/system-prompt';

const base: ProjectContext = {
  layers: [{ id: 'L', name: 'Boundary', color: '#fff' }],
  activeLayerId: 'L',
  mode: 'COPILOT',
  sandboxDefault: false,
  autoApproveThreshold: 0.7,
};

describe('AI system prompt — existing point/line data', () => {
  it('lists named points with coordinates so the model can resolve "500", "528"', () => {
    const prompt = buildSystemPrompt({
      ...base,
      points: [
        { name: '500', x: 5115.976, y: 4855.956, code: 'BC03' },
        { name: '528', x: 5102.973, y: 4856.445 },
      ],
    });
    expect(prompt).toContain('Existing survey points');
    expect(prompt).toContain('500: (5115.976, 4855.956) [BC03]');
    expect(prompt).toContain('528: (5102.973, 4856.445)');
  });

  it('instructs the model to use the calc* solver tools for computed geometry', () => {
    const prompt = buildSystemPrompt(base);
    expect(prompt.toLowerCase()).toContain('solver tool');
    expect(prompt).toContain('perpendicular');
  });

  it('says "(none)" when there are no points', () => {
    const prompt = buildSystemPrompt(base);
    expect(prompt).toMatch(/Existing survey points[\s\S]*\(none\)/);
  });

  it('includes sketch/image review + edge-pairing guidance', () => {
    const prompt = buildSystemPrompt(base);
    expect(prompt).toContain('Reviewing an attached image');
    expect(prompt.toLowerCase()).toContain('per-edge');
    expect(prompt.toLowerCase()).toContain('did not shoot');
  });
});
