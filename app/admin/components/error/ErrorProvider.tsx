// app/admin/components/error/ErrorProvider.tsx — Global error context + user report dialog
'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import {
  type ErrorReport,
  addBreadcrumb,
  addConsoleLog,
  getBreadcrumbs,
  getConsoleLogs,
  getEnvironmentInfo,
  getElementSelector,
  submitErrorReport,
  retryPendingReports,
  resetSession,
} from '@/lib/errorHandler';
import ErrorReportDialog from './ErrorReportDialog';

/* ─── Context Types ─── */
interface ErrorContextType {
  /** Report an error and show the dialog to the user */
  reportError: (error: Error | string, context?: ErrorContext) => void;
  /** Report an API error from a failed fetch */
  reportApiError: (url: string, method: string, status: number, message: string, context?: ErrorContext) => void;
  /** Report a validation error (form errors, etc.) */
  reportValidationError: (message: string, context?: ErrorContext) => void;
  /** Total errors in current session */
  errorCount: number;
}

interface ErrorContext {
  component_name?: string;
  element_selector?: string;
  api_endpoint?: string;
  request_method?: string;
  request_body?: Record<string, unknown>;
  error_type?: ErrorReport['error_type'];
  error_code?: string;
  severity?: ErrorReport['severity'];
}

interface PendingError {
  report: Partial<ErrorReport>;
  timestamp: Date;
}

const ErrorContext = createContext<ErrorContextType>({
  reportError: () => {},
  reportApiError: () => {},
  reportValidationError: () => {},
  errorCount: 0,
});

export function useErrorReporter(): ErrorContextType {
  return useContext(ErrorContext);
}

/* ─── Provider Component ─── */
export default function ErrorProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [pendingError, setPendingError] = useState<PendingError | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const prevPathname = useRef(pathname);

  // Track page navigations as breadcrumbs
  useEffect(() => {
    if (pathname !== prevPathname.current) {
      addBreadcrumb({
        type: 'navigation',
        description: `Navigated to ${pathname}`,
        data: { from: prevPathname.current, to: pathname },
      });
      prevPathname.current = pathname;
    }
  }, [pathname]);

  // Set up global click tracking for breadcrumbs
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target) return;
      const selector = getElementSelector(target);
      addBreadcrumb({ type: 'click', description: `Clicked ${selector}` });
    }

    function handleInput(e: Event) {
      const target = e.target as HTMLInputElement;
      if (!target) return;
      const selector = getElementSelector(target);
      const type = target.type;
      // Don't log actual input values for privacy, just the element
      addBreadcrumb({
        type: 'input',
        description: `Input on ${selector}`,
        data: { inputType: type },
      });
    }

    document.addEventListener('click', handleClick, { passive: true, capture: true });
    document.addEventListener('change', handleInput, { passive: true, capture: true });
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('change', handleInput, true);
    };
  }, []);

  // Intercept console.error and console.warn
  useEffect(() => {
    const origError = console.error;
    const origWarn = console.warn;

    console.error = (...args: unknown[]) => {
      addConsoleLog({ level: 'error', message: args.map(a => String(a)).join(' ') });
      origError.apply(console, args);
    };

    console.warn = (...args: unknown[]) => {
      addConsoleLog({ level: 'warn', message: args.map(a => String(a)).join(' ') });
      origWarn.apply(console, args);
    };

    return () => {
      console.error = origError;
      console.warn = origWarn;
    };
  }, []);

  // Global unhandled error handler
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      event.preventDefault();
      triggerReport(event.error || new Error(event.message), {
        error_type: 'runtime',
        component_name: event.filename || undefined,
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      event.preventDefault();
      const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      triggerReport(err, { error_type: 'promise' });
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pathname]);

  // Retry pending reports on mount and when coming back online
  useEffect(() => {
    retryPendingReports();
    resetSession();

    function handleOnline() { retryPendingReports(); }
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Build the base report with current context
  const buildBaseReport = useCallback((): Partial<ErrorReport> => {
    const env = getEnvironmentInfo();
    return {
      page_url: typeof window !== 'undefined' ? window.location.href : '',
      page_title: typeof document !== 'undefined' ? document.title : '',
      route_path: pathname,
      user_email: session?.user?.email || 'anonymous',
      user_name: session?.user?.name || undefined,
      user_role: (session?.user as { role?: string })?.role || undefined,
      breadcrumbs: getBreadcrumbs(),
      console_logs: getConsoleLogs(),
      occurred_at: new Date().toISOString(),
      ...env,
    };
  }, [pathname, session]);

  // Core report trigger (shows dialog)
  const triggerReport = useCallback(
    (error: Error | string, ctx?: ErrorContext) => {
      const errMsg = error instanceof Error ? error.message : error;
      const errStack = error instanceof Error ? error.stack : undefined;

      const report: Partial<ErrorReport> = {
        ...buildBaseReport(),
        error_message: errMsg,
        error_stack: errStack,
        error_type: ctx?.error_type || 'unknown',
        error_code: ctx?.error_type === 'api' ? String(ctx?.request_body) : undefined,
        component_name: ctx?.component_name,
        element_selector: ctx?.element_selector,
        api_endpoint: ctx?.api_endpoint,
        request_method: ctx?.request_method,
        request_body: ctx?.request_body,
        severity: ctx?.severity,
      };

      setPendingError({ report, timestamp: new Date() });
      setDialogOpen(true);
      setErrorCount(c => c + 1);
    },
    [buildBaseReport]
  );

  // Public methods
  const reportError = useCallback(
    (error: Error | string, ctx?: ErrorContext) => {
      triggerReport(error, { error_type: 'unknown', ...ctx });
    },
    [triggerReport]
  );

  const reportApiError = useCallback(
    (url: string, method: string, status: number, message: string, ctx?: ErrorContext) => {
      triggerReport(new Error(`API Error ${status}: ${message}`), {
        error_type: 'api',
        api_endpoint: url,
        request_method: method,
        error_code: String(status),
        ...ctx,
      });
    },
    [triggerReport]
  );

  const reportValidationError = useCallback(
    (message: string, ctx?: ErrorContext) => {
      triggerReport(new Error(message), {
        error_type: 'validation',
        severity: 'low',
        ...ctx,
      });
    },
    [triggerReport]
  );

  // Handle dialog submit
  async function handleDialogSubmit(userFeedback: {
    notes: string;
    expected: string;
    causeGuess: string;
    severity: ErrorReport['severity'];
  }) {
    if (!pendingError) return;

    const fullReport: ErrorReport = {
      error_message: pendingError.report.error_message || 'Unknown error',
      error_type: pendingError.report.error_type || 'unknown',
      page_url: pendingError.report.page_url || window.location.href,
      user_email: pendingError.report.user_email || 'anonymous',
      ...pendingError.report,
      user_notes: userFeedback.notes,
      user_expected: userFeedback.expected,
      user_cause_guess: userFeedback.causeGuess,
      severity: userFeedback.severity,
    };

    await submitErrorReport(fullReport);
    setDialogOpen(false);
    setPendingError(null);
  }

  // Handle dialog dismiss (still submit the error, just without user notes)
  async function handleDialogDismiss() {
    if (pendingError) {
      const fullReport: ErrorReport = {
        error_message: pendingError.report.error_message || 'Unknown error',
        error_type: pendingError.report.error_type || 'unknown',
        page_url: pendingError.report.page_url || window.location.href,
        user_email: pendingError.report.user_email || 'anonymous',
        ...pendingError.report,
        user_notes: '(User dismissed without adding notes)',
      };
      await submitErrorReport(fullReport);
    }
    setDialogOpen(false);
    setPendingError(null);
  }

  return (
    <ErrorContext.Provider value={{ reportError, reportApiError, reportValidationError, errorCount }}>
      {children}
      {dialogOpen && pendingError && (
        <ErrorReportDialog
          errorMessage={pendingError.report.error_message || 'An unexpected error occurred'}
          errorType={pendingError.report.error_type || 'unknown'}
          pagePath={pendingError.report.route_path || pathname}
          componentName={pendingError.report.component_name}
          onSubmit={handleDialogSubmit}
          onDismiss={handleDialogDismiss}
        />
      )}
    </ErrorContext.Provider>
  );
}
