// app/api/admin/research/testing/push/route.ts
// Commit and push file changes to a branch via GitHub API
import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_OWNER = 'juggernautjake';
const REPO_NAME = 'STARR-SURVEYING';

/* POST — Commit a file change to a branch */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isDeveloper(session.user.roles)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!GITHUB_TOKEN) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 503 });
  }

  const { branch, path, content, message, sha } = await req.json();

  if (!branch || !path || content === undefined || !message) {
    return NextResponse.json({
      error: 'branch, path, content, and message are required',
    }, { status: 400 });
  }

  try {
    // If no SHA provided, get current file SHA first
    let fileSha = sha;
    if (!fileSha) {
      const existingRes = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );
      if (existingRes.ok) {
        const existingData = await existingRes.json();
        fileSha = existingData.sha;
      }
    }

    // Create or update the file
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'PUT',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `[Testing Lab] ${message}`,
          content: Buffer.from(content, 'utf-8').toString('base64'),
          branch,
          sha: fileSha || undefined,
          committer: {
            name: session.user.name || 'Testing Lab',
            email: session.user.email,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err.message || 'Failed to push' }, { status: 422 });
    }

    const data = await res.json();
    return NextResponse.json({
      success: true,
      sha: data.content.sha,
      commit: data.commit.sha,
      path: data.content.path,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to push' }, { status: 500 });
  }
});
