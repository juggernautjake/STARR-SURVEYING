// __tests__/files/comments.test.ts — the notes on a file, and who may change them.
//
// The asymmetry between edit and delete is the part worth pinning: an admin may REMOVE somebody
// else's note but may not REWRITE it, because a rewritten note still carries the original author's
// name. That is easy to "simplify" into one `isAdmin ||` check later, and this is the test that
// stops it.

import { describe, it, expect } from 'vitest';
import {
  checkCommentBody,
  canEditComment,
  canDeleteComment,
  authorLabel,
  isCommentSubjectType,
  COMMENT_SUBJECT_TYPES,
  MAX_COMMENT_LENGTH,
} from '@/lib/files/comments';

const author = { email: 'crew@starrsurveying.com', isAdmin: false };
const admin = { email: 'boss@starrsurveying.com', isAdmin: true };
const other = { email: 'someone@starrsurveying.com', isAdmin: false };
const comment = { id: 'c1', author_email: 'crew@starrsurveying.com' };

describe('checkCommentBody', () => {
  it('keeps an ordinary note', () => {
    expect(checkCommentBody('Found the pin under 3in of gravel.')).toEqual({
      ok: true,
      value: 'Found the pin under 3in of gravel.',
    });
  });

  it('KEEPS newlines — unlike a label', () => {
    // Somebody describing three monuments writes three lines, and re-flowing them loses the list.
    const result = checkCommentBody('1. NW pin\n2. NE pin\n3. SE rebar');
    expect(result.value).toBe('1. NW pin\n2. NE pin\n3. SE rebar');
  });

  it('normalises Windows line endings', () => {
    expect(checkCommentBody('one\r\ntwo').value).toBe('one\ntwo');
  });

  it('collapses a run of blank lines from a Word paste', () => {
    expect(checkCommentBody('top\n\n\n\n\nbottom').value).toBe('top\n\nbottom');
  });

  it('trims trailing spaces on each line', () => {
    expect(checkCommentBody('one   \ntwo\t').value).toBe('one\ntwo');
  });

  it('refuses an empty note', () => {
    expect(checkCommentBody('').ok).toBe(false);
    expect(checkCommentBody('   \n  ').ok).toBe(false);
  });

  it('refuses a non-string', () => {
    expect(checkCommentBody(null).ok).toBe(false);
    expect(checkCommentBody(12).ok).toBe(false);
  });

  it('refuses a note longer than the cap', () => {
    const result = checkCommentBody('x'.repeat(MAX_COMMENT_LENGTH + 1));
    expect(result.ok).toBe(false);
    expect(result.error).toContain(String(MAX_COMMENT_LENGTH));
  });

  it('accepts exactly the cap', () => {
    expect(checkCommentBody('x'.repeat(MAX_COMMENT_LENGTH)).ok).toBe(true);
  });
});

describe('canEditComment', () => {
  it('lets the author edit their own note', () => {
    expect(canEditComment(comment, author)).toBe(true);
  });

  it('does NOT let an admin rewrite somebody else, even though they can delete it', () => {
    // Editing leaves the original author's name on words they did not write. That is
    // misattribution, and it is the one place this platform does not give admins everything.
    expect(canEditComment(comment, admin)).toBe(false);
    expect(canDeleteComment(comment, admin)).toBe(true);
  });

  it('does not let an unrelated person edit', () => {
    expect(canEditComment(comment, other)).toBe(false);
  });

  it('compares email case- and whitespace-insensitively', () => {
    expect(canEditComment({ ...comment, author_email: '  CREW@StarrSurveying.com ' }, author)).toBe(true);
  });

  it('never matches on an empty identity', () => {
    // Two rows both missing an email must not become "the same person".
    expect(canEditComment({ id: 'c', author_email: '' }, { email: '', isAdmin: false })).toBe(false);
  });

  it('refuses to edit an already-removed note', () => {
    expect(canEditComment({ ...comment, deleted_at: '2026-08-22T00:00:00Z' }, author)).toBe(false);
  });
});

describe('canDeleteComment', () => {
  it('lets the author remove their own', () => {
    expect(canDeleteComment(comment, author)).toBe(true);
  });

  it('lets an admin remove anybody’s', () => {
    expect(canDeleteComment(comment, admin)).toBe(true);
  });

  it('does not let an unrelated non-admin remove', () => {
    expect(canDeleteComment(comment, other)).toBe(false);
  });

  it('refuses to remove an already-removed note', () => {
    expect(canDeleteComment({ ...comment, deleted_at: '2026-08-22T00:00:00Z' }, admin)).toBe(false);
  });
});

describe('authorLabel', () => {
  it('prefers the stored name', () => {
    expect(authorLabel({ author_name: 'Jack C', author_email: 'jack@x.com' })).toBe('Jack C');
  });

  it('falls back to the email local part when the name was never stored', () => {
    // This is the case that matters after an account is deactivated and the lookup returns nothing.
    expect(authorLabel({ author_name: null, author_email: 'jack@x.com' })).toBe('jack');
    expect(authorLabel({ author_name: '   ', author_email: 'jack@x.com' })).toBe('jack');
  });

  it('never renders an empty name', () => {
    expect(authorLabel({ author_name: null, author_email: '' })).toBe('Someone');
  });
});

describe('isCommentSubjectType', () => {
  it('accepts the two tables a file can live in', () => {
    expect(COMMENT_SUBJECT_TYPES).toEqual(['job_file', 'field_media']);
    expect(isCommentSubjectType('job_file')).toBe(true);
    expect(isCommentSubjectType('field_media')).toBe(true);
  });

  it('rejects anything else, so a subject_type cannot name an arbitrary table', () => {
    expect(isCommentSubjectType('jobs')).toBe(false);
    expect(isCommentSubjectType('')).toBe(false);
    expect(isCommentSubjectType(null)).toBe(false);
  });
});
