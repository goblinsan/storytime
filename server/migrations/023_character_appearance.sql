-- Migration 023: what somebody looks like, as its own field
--
-- It was inside the history prose. Lord Malakor's says "smooth dark faceless
-- angular helm, glowing blue eye-slits" three sentences into a paragraph about
-- Oakhaven falling, so anything wanting to draw him had to take the whole
-- paragraph and hope. It drew plate armour and a visible face.
--
-- `description` is not the same thing and was already carrying its own meaning
-- -- what somebody notices meeting them, which is manner as much as looks. A
-- picture needs the physical facts, listed, and those want a field of their own
-- rather than a share of a paragraph.
--
-- Additive and idempotent.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS appearance TEXT NOT NULL DEFAULT '';
