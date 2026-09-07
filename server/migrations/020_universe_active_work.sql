-- Migration 020: which work a universe is currently being read through
--
-- Billing is per work (migration 019), so every surface that orders a cast has
-- to know which work it is ordering for. Holding that only in the URL means the
-- answer is different in every tab and forgotten on every reload; a universe
-- being focused on one arc is a fact about the universe.
--
-- Nullable on purpose: no active work is a real state, not a missing one. The
-- cast then reads its order from the canon graph instead.
--
-- Additive and idempotent.

ALTER TABLE stories ADD COLUMN IF NOT EXISTS active_work_id TEXT
  REFERENCES derivative_works(id) ON DELETE SET NULL;
