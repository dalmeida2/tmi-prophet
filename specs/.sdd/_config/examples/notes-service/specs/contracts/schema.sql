-- PostgreSQL 16. Timestamps stored at millisecond precision (profile SER-2).
CREATE TABLE notes (
  id          uuid PRIMARY KEY,                                   -- UUIDv7, monotonic (SER-3)
  title       text COLLATE "C" NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  body        text COLLATE "C" NOT NULL DEFAULT '' CHECK (char_length(body) <= 10000),
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  version     integer NOT NULL DEFAULT 1 CHECK (version >= 1),    -- OCC (OCC-1)
  created_at  timestamp(3) with time zone NOT NULL,
  updated_at  timestamp(3) with time zone NOT NULL
);

-- Keyset pagination order (PAGE-3): created_at DESC, id DESC.
CREATE INDEX notes_list_idx ON notes (created_at DESC, id DESC);
CREATE INDEX notes_status_list_idx ON notes (status, created_at DESC, id DESC);

-- Idempotency records (IDEM-2..6): one row per key, kept 24 h after completion.
CREATE TABLE idempotency_keys (
  key          uuid PRIMARY KEY,
  fingerprint  text NOT NULL,                 -- method + path + canonical JSON body (IDEM-3)
  state        text NOT NULL CHECK (state IN ('in_flight', 'completed')),
  status       integer,
  headers      jsonb,
  body         jsonb,
  completed_at timestamp(3) with time zone
);
