// lib/apiErrorHandler.ts — Server-side API route error handling utility
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Wraps an API route handler with comprehensive error handling.
 * Catches all errors, logs them to the error_reports table, and returns
 * a structured error response.
 *
 * Usage:
 *   export const GET = withErrorHandler(async (req) => {
 *     // your route logic
 *     return NextResponse.json({ data });
 *   });
 */
export function withErrorHandler(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options?: { routeName?: string }
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const routePath = new URL(req.url).pathname;

      console.error(`[API Error] ${req.method} ${routePath}:`, error.message);

      // Log to error_reports table (best-effort, don't let logging failure crash the response)
      try {
        const session = await auth().catch(() => null);
        await supabaseAdmin.from('error_reports').insert({
          error_message: error.message.slice(0, 2000),
          error_stack: error.stack?.slice(0, 5000) || null,
          error_type: 'api',
          api_endpoint: routePath,
          request_method: req.method,
          route_path: routePath,
          page_url: req.headers.get('referer') || routePath,
          component_name: options?.routeName || routePath,
          user_email: session?.user?.email || 'system',
          user_name: session?.user?.name || null,
          user_role: (session?.user as { role?: string })?.role || null,
          severity: 'high',
          status: 'new',
          occurred_at: new Date().toISOString(),
        }).catch(() => {}); // Silently fail if DB logging fails
      } catch { /* ignore logging failures */ }

      return NextResponse.json(
        {
          error: 'An unexpected error occurred',
          message: process.env.NODE_ENV === 'development' ? error.message : undefined,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Helper to create a consistent error response
 */
export function apiError(message: string, status: number = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Helper to validate that a user is authenticated
 */
export async function requireAuth(): Promise<{ email: string; name?: string; role?: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return {
    email: session.user.email,
    name: session.user.name || undefined,
    role: (session.user as { role?: string }).role || undefined,
  };
}
