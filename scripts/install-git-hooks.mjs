#!/usr/bin/env node
// Runs on `npm install` (the "prepare" script). Points git at the repo's .githooks folder so the
// pre-push check runs. Does nothing outside a git checkout (CI caches, Vercel, tarballs).

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('.git') || process.env.CI) process.exit(0);
try {
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
} catch {
  // git not on PATH — skip quietly; the hook is a convenience, CI still checks everything.
}
