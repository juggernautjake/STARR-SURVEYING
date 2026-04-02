// app/api/admin/research/testing/pull/route.ts
// Pull latest from a remote branch (triggers a deployment rebuild)
import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_OWNER = 'juggernautjake';
const REPO_NAME = 'STARR-SURVEYING';

/* POST — Get the latest commit info for a branch */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isDeveloper(session.user.roles)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { branch } = await req.json();
  if (!branch) {
    return NextResponse.json({ error: 'branch is required' }, { status: 400 });
  }

  if (!GITHUB_TOKEN) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 503 });
  }

  try {
    // Get the latest commit for the branch
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/branches/${encodeURIComponent(branch)}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `Branch "${branch}" not found` }, { status: 404 });
    }

    const data = await res.json();
    return NextResponse.json({
      success: true,
      branch: data.name,
      sha: data.commit.sha,
      message: data.commit.commit.message,
      author: data.commit.commit.author?.name,
      date: data.commit.commit.author?.date,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
});
