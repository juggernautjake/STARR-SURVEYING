-- 537_research_requests.sql — request in, packet out, nobody in the loop (plan R28).
--
-- Starting research required a person: create a project in the admin UI, then press a button. The
-- owner's ask is the opposite — "a request comes in → the server works 20–30 minutes → done" — and
-- there was no object representing a request at all, so nothing could queue, retry, deduplicate or
-- notify.
--
-- ── DEDUPLICATION IS THE EXPENSIVE PART ─────────────────────────────────────────────────────────
--
-- A run costs 20–30 minutes of a machine and real money in paid pages. Two requests for the same
-- property must not both run. The unique index below is partial on the ACTIVE states: once a request
-- is finished, the same address may legitimately be requested again months later (that is R27's
-- re-run), so a total unique index would block the second job on a property forever.
--
-- ── CLAIMING MUST BE ATOMIC ─────────────────────────────────────────────────────────────────────
--
-- Two workers polling the same queue will race. The claim is a conditional UPDATE guarded on
-- `status = 'queued'` and checked by row count — a read-then-write would hand one property to two
-- machines and pay for it twice.

CREATE TABLE IF NOT EXISTS research_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What was asked for.
    address             TEXT NOT NULL,
    county              TEXT NOT NULL,
    state               TEXT NOT NULL DEFAULT 'TX',
    parcel_id           TEXT,
    owner_name          TEXT,
    -- Normalised address+county, used for the duplicate guard. Stored rather than computed so the
    -- index is on a plain column and the normalisation rule lives in one place in code.
    dedupe_key          TEXT NOT NULL,

    -- Where it came from: 'api' | 'job' | 'intake' | 'manual'.
    source              TEXT NOT NULL DEFAULT 'api',
    job_id              UUID REFERENCES jobs(id) ON DELETE SET NULL,
    requested_by        TEXT,
    -- Who to tell when it finishes OR fails. Failure is the one people forget to notify about.
    notify_email        TEXT,

    status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'running', 'complete', 'failed', 'cancelled', 'duplicate')),

    -- Filled in as it progresses.
    research_project_id UUID REFERENCES research_projects(id) ON DELETE SET NULL,
    packet_id           UUID REFERENCES research_packets(id) ON DELETE SET NULL,
    duplicate_of        UUID REFERENCES research_requests(id) ON DELETE SET NULL,

    -- A request that fails forever must stop and say so rather than retry into infinity.
    attempts            INTEGER NOT NULL DEFAULT 0,
    max_attempts        INTEGER NOT NULL DEFAULT 3,
    failure_reason      TEXT,

    -- Told the requester, either way. Null means the notification has not been sent — which is a
    -- state worth being able to find, because a finished run nobody was told about is a run that
    -- did not happen as far as the business is concerned.
    notified_at         TIMESTAMPTZ,

    queued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One ACTIVE request per property. Partial on purpose: once finished, the same address may be
-- requested again months later, and a total unique index would block the second job forever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_requests_active
    ON research_requests (dedupe_key)
    WHERE status IN ('queued', 'running');

-- The poller's question: what is next.
CREATE INDEX IF NOT EXISTS idx_research_requests_queue
    ON research_requests (queued_at)
    WHERE status = 'queued';

-- The one nobody was told about.
CREATE INDEX IF NOT EXISTS idx_research_requests_unnotified
    ON research_requests (finished_at)
    WHERE notified_at IS NULL AND status IN ('complete', 'failed');

CREATE INDEX IF NOT EXISTS idx_research_requests_job ON research_requests (job_id);
