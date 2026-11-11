ALTER TABLE listings ADD COLUMN IF NOT EXISTS item_condition TEXT CHECK(item_condition IN ('new','excellent','good','used','repair'));
ALTER TABLE listings ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(attributes)='object');
