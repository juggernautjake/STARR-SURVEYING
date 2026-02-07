// app/admin/hooks/usePageError.ts — Error-aware fetch and action helpers for admin pages
'use client';

import { useCallback } from 'react';
import { useErrorReporter } from '../components/error/ErrorProvider';
import { addBreadcrumb, sanitizeBody } from '@/lib/errorHandler';

/**
 * Hook that provides error-aware versions of common page operations.
 * Wraps fetch calls and action handlers with automatic error reporting.
 *
 * Usage:
 *   const { safeFetch, safeAction } = usePageError('JobDetailPage');
 *
 *   // Auto-reports API errors:
 *   const data = await safeFetch('/api/admin/jobs?id=123');
 *
 *   // Auto-reports action errors:
 *   await safeAction('saving job', async () => {
 *     await fetch('/api/admin/jobs', { method: 'POST', body: ... });
 *   });
 */
export function usePageError(componentName: string) {
  const { reportError, reportApiError } = useErrorReporter();

  /**
   * Error-aware fetch that automatically reports API failures.
   * Returns the parsed JSON data or null if the request failed.
   */
  const safeFetch = useCallback(
    async <T = unknown>(
      url: string,
      options?: RequestInit & { silent?: boolean }
    ): Promise<T | null> => {
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

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          const errorMsg = errorData.error || errorData.message || `Request failed with status ${res.status}`;

          if (!options?.silent) {
            reportApiError(url, method, res.status, errorMsg, {
              component_name: componentName,
              request_body: options?.body ? sanitizeBody(JSON.parse(options.body as string)) : undefined,
            });
          }
          return null;
        }

        return await res.json() as T;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (!options?.silent) {
          reportError(error, {
            error_type: 'network',
            component_name: componentName,
            api_endpoint: url,
            request_method: method,
          });
        }
        return null;
      }
    },
    [componentName, reportError, reportApiError]
  );

  /**
   * Wraps an async action with error reporting.
   * If the action throws, the error is caught and reported.
   */
  const safeAction = useCallback(
    async <T = void>(
      actionDescription: string,
      action: () => Promise<T>
    ): Promise<T | null> => {
      addBreadcrumb({
        type: 'custom',
        description: `Action: ${actionDescription}`,
        data: { component: componentName },
      });

      try {
        return await action();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        reportError(error, {
          component_name: componentName,
          element_selector: actionDescription,
        });
        return null;
      }
    },
    [componentName, reportError]
  );

  /**
   * Manually report an error with page context pre-filled.
   */
  const reportPageError = useCallback(
    (error: Error | string, context?: { element?: string; severity?: 'low' | 'medium' | 'high' | 'critical' }) => {
      reportError(error, {
        component_name: componentName,
        element_selector: context?.element,
        severity: context?.severity,
      });
    },
    [componentName, reportError]
  );

  return { safeFetch, safeAction, reportPageError };
}
