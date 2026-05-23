// lib/apiErrorHandler.ts — Server-side API route error handling utility
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AIServiceError } from '@/lib/research/ai-client';

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
  options?: { routeName?: string; exposeErrors?: boolean }
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
        });
        // NOTE: no `.catch()` on the builder above — Supabase query
        // builders are thenable but have no `.catch` method, so
        // `builder.catch()` throws "catch is not a function". The
        // surrounding try/catch is what swallows logging failures.
        // (This very bug previously made error_reports inserts fail
        // silently, leaving the table empty during outages.)
      } catch { /* ignore logging failures */ }

      // For AI service errors, return the user-friendly message and category
      if (err instanceof AIServiceError) {
        return NextResponse.json(
          {
            error: err.userMessage,
            errorCategory: err.category,
            timestamp: new Date().toISOString(),
          },
          { status: err.statusCode || 502 }
        );
      }

      // Surface the real message when the route opts in (internal
      // admin tooling) or in development. Public routes (e.g.
      // share/[token]) keep the generic message so DB internals
      // don't leak to unauthenticated viewers.
      const reveal = options?.exposeErrors || process.env.NODE_ENV === 'development';
      return NextResponse.json(
        {
          error: reveal && error.message ? error.message : 'An unexpected error occurred',
          message: reveal ? error.message : undefined,
          step: reveal ? 'unhandled exception' : undefined,
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
 * Await a best-effort ("fire and forget") database write, swallowing
 * any error. Use this for advisory writes like activity logs and
 * notifications whose failure must never break the main request.
 *
 * IMPORTANT: do NOT write `supabaseAdmin.from(...).insert(...).catch(...)`.
 * Supabase query builders are thenable (awaitable) but have no
 * `.catch` method, so calling `.catch()` on the builder throws
 * "catch is not a function". Pass the builder here instead:
 *   await fireAndForget(supabaseAdmin.from('activity_log').insert({...}));
 */
export async function fireAndForget(op: PromiseLike<unknown>): Promise<void> {
  try {
    await op;
  } catch {
    /* advisory write; intentionally ignored */
  }
}

/**
 * Shape of a Supabase/PostgREST error (or any pg-style error). Kept
 * structural so callers don't need to import the SDK error type.
 */
export interface DbErrorLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

/**
 * Translate a database error into a specific, actionable HTTP
 * response. Supabase's `.insert()/.update()` return an `error`
 * object (they don't throw); pass it here to turn an opaque
 * Postgres message into something a human can act on.
 *
 * `step` names the operation that failed (e.g. "create job",
 * "add tags") so a multi-step route can say exactly which write
 * broke. The raw `code`, `detail`, `hint`, and `dbMessage` ride
 * along in the JSON so this internal admin tooling stays
 * debuggable without digging through server logs.
 */
export function dbErrorResponse(error: DbErrorLike, step: string): NextResponse {
  const code = error.code ?? null;
  const meta = {
    step,
    code,
    detail: error.details ?? null,
    hint: error.hint ?? null,
    dbMessage: error.message ?? null,
  };

  // Pull the offending column out of a not-null message like:
  //   null value in column "org_id" of relation "jobs" ...
  const colMatch = error.message?.match(/column "([^"]+)"/);
  const column = colMatch?.[1];

  switch (code) {
    case '23502': // not_null_violation
      return NextResponse.json({
        error: `Could not ${step}: a required field${column ? ` ("${column}")` : ''} was empty. `
          + `If this is "org_id", your account isn't linked to an organization yet — run seed 289 / verify org setup.`,
        ...meta,
      }, { status: 422 });
    case '23503': // foreign_key_violation
      return NextResponse.json({
        error: `Could not ${step}: it references a record that doesn't exist`
          + `${error.details ? ` (${error.details})` : ''}.`,
        ...meta,
      }, { status: 422 });
    case '23505': // unique_violation
      return NextResponse.json({
        error: `Could not ${step}: a record with that value already exists`
          + `${error.details ? ` (${error.details})` : ''}.`,
        ...meta,
      }, { status: 409 });
    case '23514': // check_violation
      return NextResponse.json({
        error: `Could not ${step}: a value failed a validation rule`
          + `${error.details ? ` (${error.details})` : ''}.`,
        ...meta,
      }, { status: 422 });
    case '42501': // insufficient_privilege (RLS / role)
      return NextResponse.json({
        error: `Could not ${step}: the database denied permission (row-level security). `
          + `The service-role key may be missing in this environment, or an RLS policy is blocking the write.`,
        ...meta,
      }, { status: 403 });
    case '42P01': // undefined_table
      return NextResponse.json({
        error: `Could not ${step}: a required table is missing — a database migration/seed hasn't been applied. (${error.message})`,
        ...meta,
      }, { status: 500 });
    case '42703': // undefined_column
      return NextResponse.json({
        error: `Could not ${step}: a required column is missing — a database migration/seed hasn't been applied. (${error.message})`,
        ...meta,
      }, { status: 500 });
    default:
      return NextResponse.json({
        error: `Could not ${step}: ${error.message || 'unknown database error'}.`,
        ...meta,
      }, { status: 500 });
  }
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
