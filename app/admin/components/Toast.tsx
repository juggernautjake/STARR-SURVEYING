// app/admin/components/Toast.tsx — Global toast notification system
'use client';
import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  dismissible: boolean;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  addToast: () => {},
  removeToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev.slice(-4), { id, message, type, duration, dismissible: true }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

const ICONS: Record<ToastType, string> = {
  success: '\u2713',
  error: '\u2717',
  warning: '\u26A0',
  info: '\u2139',
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="alert" aria-live="polite">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (toast.duration > 0) {
      const exitTimer = setTimeout(() => setExiting(true), toast.duration - 300);
      return () => clearTimeout(exitTimer);
    }
    return undefined;
  }, [toast.duration]);

  return (
    <div
      className={`toast-item toast-item--${toast.type} ${exiting ? 'toast-item--exit' : ''}`}
      role="status"
      onClick={() => { setExiting(true); setTimeout(() => onDismiss(toast.id), 200); }}
    >
      <span className="toast-item__icon">{ICONS[toast.type]}</span>
      <span className="toast-item__message">{toast.message}</span>
      <button
        className="toast-item__close"
        onClick={(e) => { e.stopPropagation(); setExiting(true); setTimeout(() => onDismiss(toast.id), 200); }}
        aria-label="Dismiss notification"
      >
        &times;
      </button>
    </div>
  );
}
