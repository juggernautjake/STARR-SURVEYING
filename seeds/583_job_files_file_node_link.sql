-- seeds/583_job_files_file_node_link.sql
--
-- F5 adoption — attach a File Explorer document to a job without copying its bytes.
--
-- ── THE DEFERRAL THIS UNBLOCKS WAS BASED ON A WRONG PREMISE ───────────────────────────────────────
--
-- F5 deferred adopting the shared picker for job files, and gave this reason: *"`job_files.storage_path`
-- is `NOT NULL` and points into the `starr-field-files` bucket"*, so attaching would mean either copying
-- the bytes or making `storage_path` nullable plus a read-path change everywhere.
--
-- Checked against production before building on it, and it is not what the table says:
--
--   * `job_files.storage_path` is **NULLABLE**. There is nothing to relax.
--   * `job_files` holds **ZERO rows**. There is nothing to migrate, and no "referenced rows" to treat
--     specially.
--   * Job files are not in that bucket at all. `JobFileManager` writes `reader.result` into
--     `job_files.file_url` — a **base64 data URL** in a text column. The bucket path in the deferral
--     note describes `field_media`, a different table.
--
-- So the "slice of its own, with a seed" is one nullable column and one index. The costly half — making
-- a NOT NULL column nullable across existing data — never existed. Worth stating in full because the
-- deferral was reasonable-sounding and self-consistent, and still wrong: a premise about a schema is
-- cheap to verify and was not verified.
--
-- ── WHY A LINK AND NOT A COPY ─────────────────────────────────────────────────────────────────────
--
-- Copying the bytes gives two files that immediately begin to diverge, with nothing to say which is
-- current — and it defeats the point of the File Explorer's permissions, because the copy answers to
-- the job's rules rather than the document's. A reference keeps one document with one permission set.
--
-- ── NO "AT LEAST ONE SOURCE" CHECK CONSTRAINT, DELIBERATELY ───────────────────────────────────────
--
-- A row ought to carry exactly one of `file_url` / `storage_path` / `file_node_id`, and a CHECK saying
-- so would be good hygiene. It is not added here: `POST /api/admin/jobs/files` today accepts a row with
-- no file reference at all (only `job_id` + `file_name` are required), so the constraint would reject
-- writes the app currently makes. Tightening that is a behaviour change to the upload path and belongs
-- with it, not smuggled in behind a column addition. Named rather than silently imposed.

ALTER TABLE job_files
  ADD COLUMN IF NOT EXISTS file_node_id UUID REFERENCES file_nodes(id) ON DELETE SET NULL;

COMMENT ON COLUMN job_files.file_node_id IS
  'F5: when set, this job file is a REFERENCE to a File Explorer document (file_nodes) rather than '
  'bytes of its own. Mutually exclusive with file_url/storage_path in practice. ON DELETE SET NULL '
  'rather than CASCADE so deleting the document does not delete the job attachment row — the row '
  'survives as evidence that someone attached something. NOTE what SET NULL does and does not buy: '
  'it keeps the ROW, but it also erases the id, so nothing on the row records that it was ever a '
  'link. The UI can therefore label the PERMISSION case (id still present, document not resolvable '
  'for this viewer) but not the DELETED case, which degrades to a row with neither bytes nor a link. '
  'Verified by deleting a document live: file_node_id became null. Carrying a name snapshot would fix '
  'that and is not worth a column until someone asks for it.';

-- Partial: only referencing rows are interesting, and the column is null for every ordinary upload.
CREATE INDEX IF NOT EXISTS idx_job_files_file_node
  ON job_files (file_node_id)
  WHERE file_node_id IS NOT NULL;
