// __tests__/cad/custom-linetypes.test.ts
// Drawing-store actions for user-defined custom line types.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import type { LineTypeDefinition } from '@/lib/cad/styles/types';

function makeLT(id: string, over: Partial<LineTypeDefinition> = {}): LineTypeDefinition {
  return {
    id,
    name: id,
    category: 'CUSTOM',
    dashPattern: [10, 6],
    inlineSymbols: [],
    specialRenderer: 'NONE',
    isBuiltIn: false,
    isEditable: true,
    assignedCodes: [],
    ...over,
  };
}

describe('custom line type store actions', () => {
  beforeEach(() => {
    useDrawingStore.getState().newDocument();
  });

  it('adds a custom line type and forces CUSTOM/editable flags', () => {
    useDrawingStore.getState().addCustomLineType(
      makeLT('lt1', { category: 'BASIC', isBuiltIn: true, isEditable: false })
    );
    const lts = useDrawingStore.getState().document.customLineTypes;
    expect(lts).toHaveLength(1);
    expect(lts[0].id).toBe('lt1');
    expect(lts[0].category).toBe('CUSTOM');
    expect(lts[0].isBuiltIn).toBe(false);
    expect(lts[0].isEditable).toBe(true);
    expect(useDrawingStore.getState().isDirty).toBe(true);
  });

  it('replaces rather than duplicates when adding the same id', () => {
    useDrawingStore.getState().addCustomLineType(makeLT('lt1', { name: 'First' }));
    useDrawingStore.getState().addCustomLineType(makeLT('lt1', { name: 'Second' }));
    const lts = useDrawingStore.getState().document.customLineTypes;
    expect(lts).toHaveLength(1);
    expect(lts[0].name).toBe('Second');
  });

  it('updates an existing custom line type in place', () => {
    useDrawingStore.getState().addCustomLineType(makeLT('lt1', { dashPattern: [10, 6] }));
    useDrawingStore.getState().updateCustomLineType('lt1', { dashPattern: [20, 10], color: '#ff0000' });
    const lt = useDrawingStore.getState().document.customLineTypes[0];
    expect(lt.dashPattern).toEqual([20, 10]);
    expect(lt.color).toBe('#ff0000');
    expect(lt.id).toBe('lt1');
  });

  it('removes a custom line type', () => {
    useDrawingStore.getState().addCustomLineType(makeLT('lt1'));
    useDrawingStore.getState().addCustomLineType(makeLT('lt2'));
    useDrawingStore.getState().removeCustomLineType('lt1');
    const lts = useDrawingStore.getState().document.customLineTypes;
    expect(lts.map((l) => l.id)).toEqual(['lt2']);
  });
});
