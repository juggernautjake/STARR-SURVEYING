// lib/errorHandler.ts — Client-side error tracking utilities
// Captures breadcrumbs, console logs, and environment info for error reports

/* ─── Types ─── */
export interface ErrorReport {
  error_message: string;
  error_stack?: string;
  error_type: 'render' | 'api' | 'runtime' | 'promise' | 'network' | 'validation' | 'auth' | 'unknown';
  error_code?: string;
  component_name?: string;
  element_selector?: string;
  page_url: string;
  page_title?: string;
  route_path?: string;
  api_endpoint?: string;
  request_method?: string;
  request_body?: Record<string, unknown>;
  user_email: string;
  user_name?: string;
  user_role?: string;
  user_notes?: string;
  user_expected?: string;
  user_cause_guess?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  browser_info?: string;
  screen_size?: string;
  viewport_size?: string;
  connection_type?: string;
  memory_usage?: string;
  session_duration_ms?: number;
  console_logs?: ConsoleEntry[];
  breadcrumbs?: Breadcrumb[];
  occurred_at?: string;
}

export interface ConsoleEntry {
  level: 'error' | 'warn';
  message: string;
  timestamp: string;
}

export interface Breadcrumb {
  type: 'click' | 'navigation' | 'input' | 'api_call' | 'api_response' | 'custom';
  description: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

/* ─── Breadcrumb & Console Log Buffers ─── */
const MAX_BREADCRUMBS = 30;
const MAX_CONSOLE_LOGS = 20;

let breadcrumbs: Breadcrumb[] = [];
let consoleLogs: ConsoleEntry[] = [];
let sessionStartTime: number = Date.now();

export function resetSession(): void {
  sessionStartTime = Date.now();
  breadcrumbs = [];
  consoleLogs = [];
}

export function addBreadcrumb(crumb: Omit<Breadcrumb, 'timestamp'>): void {
  breadcrumbs.push({ ...crumb, timestamp: new Date().toISOString() });
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
}

export function addConsoleLog(entry: Omit<ConsoleEntry, 'timestamp'>): void {
  consoleLogs.push({ ...entry, timestamp: new Date().toISOString() });
  if (consoleLogs.length > MAX_CONSOLE_LOGS) consoleLogs.shift();
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbs];
}

export function getConsoleLogs(): ConsoleEntry[] {
  return [...consoleLogs];
}

/* ─── Environment Info ─── */
export function getEnvironmentInfo(): Pick<
  ErrorReport,
  'browser_info' | 'screen_size' | 'viewport_size' | 'connection_type' | 'memory_usage' | 'session_duration_ms'
> {
  if (typeof window === 'undefined') return {};

  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string };
  };
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
  };

  return {
    browser_info: navigator.userAgent,
    screen_size: `${screen.width}x${screen.height}`,
    viewport_size: `${window.innerWidth}x${window.innerHeight}`,
    connection_type: nav.connection?.effectiveType || 'unknown',
    memory_usage: perf.memory
      ? `${Math.round((perf.memory.usedJSHeapSize || 0) / 1048576)}MB / ${Math.round((perf.memory.jsHeapSizeLimit || 0) / 1048576)}MB`
      : 'unavailable',
    session_duration_ms: Date.now() - sessionStartTime,
  };
}

/* ─── Element Info Helper ─── */
export function getElementSelector(el: EventTarget | null): string {
  if (!el || !(el instanceof HTMLElement)) return 'unknown';
  const parts: string[] = [];
  const tag = el.tagName.toLowerCase();
  if (el.id) parts.push(`#${el.id}`);
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.split(/\s+/).filter(Boolean).slice(0, 3);
    if (classes.length) parts.push(`.${classes.join('.')}`);
  }
  const text = el.textContent?.trim().slice(0, 40);
  return `${tag}${parts.join('')}${text ? ` ("${text}")` : ''}`;
}

/* ─── Sanitize Request Body ─── */
const SENSITIVE_KEYS = new Set(['password', 'token', 'secret', 'api_key', 'authorization', 'cookie', 'credit_card', 'ssn']);

export function sanitizeBody(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeBody(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/* ─── Submit Error Report ─── */
export async function submitErrorReport(report: ErrorReport): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch('/api/admin/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { success: true, id: data.id };
  } catch (err) {
    // If we can't submit the report, store it locally for retry
    try {
      const pending = JSON.parse(localStorage.getItem('pending_error_reports') || '[]');
      pending.push({ ...report, _failedAt: new Date().toISOString() });
      // Keep max 50 pending reports
      if (pending.length > 50) pending.splice(0, pending.length - 50);
      localStorage.setItem('pending_error_reports', JSON.stringify(pending));
    } catch { /* localStorage might be full */ }
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/* ─── Retry Pending Reports ─── */
export async function retryPendingReports(): Promise<void> {
  try {
    const raw = localStorage.getItem('pending_error_reports');
    if (!raw) return;
    const pending: (ErrorReport & { _failedAt?: string })[] = JSON.parse(raw);
    if (!pending.length) return;

    const remaining: (ErrorReport & { _failedAt?: string })[] = [];
    for (const report of pending) {
      const { _failedAt, ...clean } = report;
      void _failedAt;
      const result = await submitErrorReport(clean);
      if (!result.success) remaining.push(report);
    }

    if (remaining.length > 0) {
      localStorage.setItem('pending_error_reports', JSON.stringify(remaining));
    } else {
      localStorage.removeItem('pending_error_reports');
    }
  } catch { /* ignore */ }
}

/* ─── Wrapped Fetch for API Calls ─── */
export async function trackedFetch(
  url: string,
  options?: RequestInit,
  context?: { componentName?: string }
): Promise<Response> {
  const method = options?.method || 'GET';
  addBreadcrumb({
    type: 'api_call',
    description: `${method} ${url}`,
    data: { url, method },
  });

  try {
    const res = await fetch(url, options);
    addBreadcrumb({
      type: 'api_response',
      description: `${method} ${url} → ${res.status}`,
      data: { url, method, status: res.status },
    });
    return res;
  } catch (err) {
    addBreadcrumb({
      type: 'api_response',
      description: `${method} ${url} → NETWORK ERROR`,
      data: { url, method, error: err instanceof Error ? err.message : 'unknown' },
    });

    // Re-throw but enrich the error
    const enriched = new Error(
      `Network error: ${method} ${url} — ${err instanceof Error ? err.message : 'Failed to fetch'}`
    );
    (enriched as Error & { originalError?: unknown; apiEndpoint?: string; requestMethod?: string; componentName?: string }).originalError = err;
    (enriched as Error & { apiEndpoint?: string }).apiEndpoint = url;
    (enriched as Error & { requestMethod?: string }).requestMethod = method;
    if (context?.componentName) {
      (enriched as Error & { componentName?: string }).componentName = context.componentName;
    }
    throw enriched;
  }
}
