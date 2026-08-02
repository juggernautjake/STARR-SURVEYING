-- 540_voice_user_username.sql — a username AND an email, both able to sign you in.
--
-- 538 gave `va_users` one login key, in a column called `email`. The owner then asked for a username
-- (`juggernautjake`) AND an email (`jacobmaddux96@gmail.com`) on the same account — which is an
-- entirely reasonable thing to want and which one column cannot hold.
--
-- Rather than overload `email` further (store a username in a column named email, and every future
-- reader has to be told), this adds a real `username` column. Login accepts either. The email column
-- goes back to meaning what it says, which matters the day this platform starts sending mail.
--
-- ── WHY THE UNIQUE INDEX IS ON lower(username) ──────────────────────────────────────────────────
--
-- The app lower-cases identifiers before storing and before looking up, so a plain UNIQUE would
-- already be sufficient in practice. The functional index makes it true regardless of the app: a row
-- inserted by hand as `Juggernautjake` cannot shadow `juggernautjake` and produce two accounts nobody
-- can tell apart at a glance. Partial, because NULL usernames are legitimate and many.

ALTER TABLE va_users ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_va_users_username
    ON va_users (lower(username))
    WHERE username IS NOT NULL;

-- Same treatment for the email column, for the same reason.
CREATE UNIQUE INDEX IF NOT EXISTS idx_va_users_email_lower
    ON va_users (lower(email));

COMMENT ON COLUMN va_users.username IS
    'Optional short login name. Either this or email signs you in; both are matched case-insensitively.';
