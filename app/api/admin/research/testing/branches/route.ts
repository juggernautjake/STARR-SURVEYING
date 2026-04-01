// app/api/admin/research/testing/branches/route.ts
// List and create git branches via GitHub API
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_OWNER = 'juggernautjake';
const REPO_NAME = 'STARR-SURVEYING';

async function githubFetch(path: string, options?: RequestInit) {
  return fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}${path}`, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': GITHUB_TOKEN ? `Bearer ${GITHUB_TOKEN}` : '',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options?.headers,
    },
  });
}

/* GET — List all branches */
export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!GITHUB_TOKEN) {
    // Fallback: return default branches
    return NextResponse.json({ branches: ['main'] });
  }

  try {
    const res = await githubFetch('/branches?per_page=100');
    if (!res.ok) {
      return NextResponse.json({ branches: ['main'], error: 'GitHub API error' });
    }
    const data = await res.json();
    const branches = data.map((b: any) => b.name);
    return NextResponse.json({ branches });
  } catch {
    return NextResponse.json({ branches: ['main'] });
  }
});

/* POST — Create a new branch */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!GITHUB_TOKEN) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 503 });
  }

  const { name, from } = await req.json();
  if (!name || !from) {
    return NextResponse.json({ error: 'name and from are required' }, { status: 400 });
  }

  try {
    // Get SHA of source branch
    const refRes = await githubFetch(`/git/ref/heads/${encodeURIComponent(from)}`);
    if (!refRes.ok) {
      return NextResponse.json({ error: `Branch "${from}" not found` }, { status: 404 });
    }
    const refData = await refRes.json();
    const sha = refData.object.sha;

    // Create new branch
    const createRes = await githubFetch('/git/refs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: `refs/heads/${name}`,
        sha,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      return NextResponse.json({ error: err.message || 'Failed to create branch' }, { status: 422 });
    }

    return NextResponse.json({ success: true, branch: name, sha });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
});
