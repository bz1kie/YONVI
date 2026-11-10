-- YORVI schema upgrade: moderation audit log.
-- Safe to apply repeatedly for local/CI installations.
CREATE TABLE IF NOT EXISTS moderation_actions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 placement_id UUID NOT NULL REFERENCES placements(id),
 moderator_id UUID NOT NULL REFERENCES users(id),
 decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
 reason TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_placement
 ON moderation_actions(placement_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_placements_community_status
 ON placements(community_id,status);
