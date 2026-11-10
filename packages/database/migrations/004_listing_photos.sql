-- Photo upload pipeline. Metadata is private until S3 object verification.
ALTER TABLE listing_media ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE listing_media ADD COLUMN IF NOT EXISTS bytes BIGINT;
ALTER TABLE listing_media ADD COLUMN IF NOT EXISTS upload_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (upload_status IN ('pending','ready'));
ALTER TABLE listing_media ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_listing_media_ready
  ON listing_media(listing_id,sort_order) WHERE upload_status='ready';
