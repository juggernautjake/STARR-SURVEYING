// app/api/admin/research/testing/files/route.ts
// Read a file from a specific branch via GitHub API
import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_OWNER = 'juggernautjake';
const REPO_NAME = 'STARR-SURVEYING';

/* GET — Read file content from a branch */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isDeveloper(session.user.roles)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const branch = req.nextUrl.searchParams.get('branch') || 'main';
  const path = req.nextUrl.searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'path parameter is required' }, { status: 400 });
  }

  if (!GITHUB_TOKEN) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 503 });
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `File not found: ${path} on ${branch}` }, { status: 404 });
    }

    const data = await res.json();

    // GitHub returns an array when the path points to a directory
    if (Array.isArray(data)) {
      const files = data.map((f: { name: string; path: string; type: string; size: number }) => ({
        name: f.name,
        path: f.path,
        type: f.type,
        size: f.size,
      }));
      return NextResponse.json({ type: 'dir', files });
    }

    // Decode file content (base64)
    const content = data.encoding === 'base64'
      ? Buffer.from(data.content, 'base64').toString('utf-8')
      : data.content;

    return NextResponse.json({
      type: 'file',
      path: data.path,
      content,
      sha: data.sha,
      size: data.size,
      branch,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to read file' }, { status: 500 });
  }
});
