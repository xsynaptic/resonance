-- One row per listen; `id` is minted by the page, so repeat reports update rather than insert
CREATE TABLE listens (
  id            TEXT PRIMARY KEY,
  mix_id        TEXT NOT NULL,
  day           TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  heard_seconds INTEGER NOT NULL,
  visitor       TEXT NOT NULL
);

-- Serves the per-visitor daily cap; updates never write either column, so they never touch it
CREATE INDEX listens_visitor_day ON listens (visitor, day);
