-- 006_bestiary_backstory_and_demographic_adaptations.sql
-- Adds sophisticated adult in-universe backstory, motivation, ecological niche,
-- and tiered demographic adaptations to bestiary entries.

ALTER TABLE bestiary ADD COLUMN IF NOT EXISTS in_universe_backstory TEXT NOT NULL DEFAULT '';
ALTER TABLE bestiary ADD COLUMN IF NOT EXISTS motivation TEXT NOT NULL DEFAULT '';
ALTER TABLE bestiary ADD COLUMN IF NOT EXISTS ecological_niche TEXT NOT NULL DEFAULT '';
ALTER TABLE bestiary ADD COLUMN IF NOT EXISTS demographic_adaptations JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE shared_bestiary ADD COLUMN IF NOT EXISTS in_universe_backstory TEXT NOT NULL DEFAULT '';
ALTER TABLE shared_bestiary ADD COLUMN IF NOT EXISTS motivation TEXT NOT NULL DEFAULT '';
ALTER TABLE shared_bestiary ADD COLUMN IF NOT EXISTS ecological_niche TEXT NOT NULL DEFAULT '';
ALTER TABLE shared_bestiary ADD COLUMN IF NOT EXISTS demographic_adaptations JSONB NOT NULL DEFAULT '{}'::jsonb;
