-- Migration 022: how a work wants to look, and where pictures can come from
--
-- Two separate things that were both living in somebody's head.
--
-- STYLE BELONGS TO THE WORK, NOT THE UNIVERSE AND NOT THE PROMPT
-- The Harrowed Veil is "warm painted storybook illustration with watercolour
-- and gouache textures ... accented by dramatic noir-style deep ink shadows".
-- That is a fact about the work, the same way its cast is: a second derivative
-- of the same universe can look nothing like it, and retyping the sentence into
-- every prompt is how two pictures of the same character end up from different
-- books. The negative is stored beside it because it is part of the same
-- decision -- "no flat cel shading, no photorealism" is the style saying what
-- it is not.
--
-- A SOURCE IS A PLACE, NOT A SECRET
-- `credential_env` names an environment variable; the value never comes near
-- this table. A key in a row is a key in a backup, in a screenshot of a query,
-- and in whatever the next person pastes into a bug report -- and the app can
-- read process.env perfectly well without the database knowing anything.
--
-- Additive and idempotent.

ALTER TABLE derivative_works ADD COLUMN IF NOT EXISTS image_style TEXT NOT NULL DEFAULT '';
ALTER TABLE derivative_works ADD COLUMN IF NOT EXISTS image_style_negative TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS image_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,

  label TEXT NOT NULL,
  -- comfyui | openai | gemini. Not a foreign key to anything: which kinds are
  -- supported is a fact about the code, and the code says so.
  kind TEXT NOT NULL,

  -- Where it lives. For ComfyUI a base URL; for a hosted API, blank means the
  -- provider's own endpoint.
  endpoint TEXT NOT NULL DEFAULT '',
  -- Which model or checkpoint to ask for.
  model TEXT NOT NULL DEFAULT '',
  -- The NAME of the environment variable holding the key, never the key.
  credential_env TEXT NOT NULL DEFAULT '',
  -- Anything kind-specific: sampler, steps, size.
  options JSONB NOT NULL DEFAULT '{}'::jsonb,

  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT image_sources_kind_check CHECK (kind IN ('comfyui', 'openai', 'gemini')),
  CONSTRAINT image_sources_label_check CHECK (label <> '')
);

CREATE INDEX IF NOT EXISTS idx_image_sources_project ON image_sources (project_id);

-- One default per universe, so "generate" never has to guess between two.
CREATE UNIQUE INDEX IF NOT EXISTS uq_image_sources_default
  ON image_sources (project_id) WHERE is_default;
