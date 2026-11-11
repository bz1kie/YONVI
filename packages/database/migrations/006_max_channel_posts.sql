CREATE TABLE IF NOT EXISTS max_channel_posts (
 placement_id UUID PRIMARY KEY REFERENCES placements(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','unknown','cancelled')),
 message_id TEXT,
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
