CREATE TABLE IF NOT EXISTS max_channel_links(
 community_id UUID PRIMARY KEY REFERENCES communities(id),
 chat_id TEXT NOT NULL UNIQUE,
 channel_url TEXT NOT NULL,
 title TEXT NOT NULL,
 verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
