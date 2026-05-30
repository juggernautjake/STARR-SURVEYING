import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HubCanvas from '@/lib/hub/components/HubCanvas';
import { useHubStore } from '@/lib/hub/hub-store';
import { defaultActions } from './helpers/hub-test-helpers';

// jsdom doesn't implement matchMedia — EditMode's useIsMobile reads it.
beforeEach(() => {
  if (!window.matchMedia) {
    // @ts-expect-error minimal shim
    window.matchMedia = (q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    });
  }
});

describe('HubCanvas', () => {
  it('renders the single Customize Hub entry button + widget grid in view mode', () => {
    useHubStore.setState({ widgets: [], draftWidgets: null, isEditMode: false, ...defaultActions } as never);
    render(<HubCanvas roles={['admin']} />);
    const entry = screen.getByTestId('open-grid-editor');
    expect(entry).toBeInTheDocument();
    expect(entry).toHaveTextContent(/Customize Hub/i);
  });

  // Slice 2 (employee-hub-overhaul) — the editor is now a single modal.
  // Clicking the entry button enters edit mode + opens the modal, and
  // the old in-header "+ Add widget" button / floating EditModeBar are
  // gone (the modal owns the whole flow). The entry button itself hides
  // once editing.
  it('clicking the entry button enters edit mode (opens the modal editor)', () => {
    const enterEditMode = vi.fn();
    useHubStore.setState({
      widgets: [], draftWidgets: null, isEditMode: false,
      ...defaultActions, enterEditMode,
    } as never);
    render(<HubCanvas roles={['admin']} />);
    fireEvent.click(screen.getByTestId('open-grid-editor'));
    expect(enterEditMode).toHaveBeenCalledTimes(1);
  });

  it('hides the entry button while already editing (modal is the only surface)', () => {
    useHubStore.setState({ widgets: [], draftWidgets: [], isEditMode: true, ...defaultActions } as never);
    render(<HubCanvas roles={['admin']} />);
    expect(screen.queryByTestId('open-grid-editor')).not.toBeInTheDocument();
    // The retired in-header "+ Add widget" button no longer renders.
    expect(screen.queryByText(/\+ Add widget/i)).not.toBeInTheDocument();
  });
});
