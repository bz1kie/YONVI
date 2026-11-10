CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 max_user_id TEXT UNIQUE,
 nickname TEXT NOT NULL DEFAULT 'Пользователь',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS communities(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id UUID NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,
 city TEXT,
 visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private'))
);
CREATE TABLE IF NOT EXISTS community_roles(
 community_id UUID NOT NULL REFERENCES communities(id),
 user_id UUID NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN('owner','moderator')),
 PRIMARY KEY(community_id,user_id)
);
CREATE TABLE IF NOT EXISTS listings(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 seller_id UUID NOT NULL REFERENCES users(id),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
 description TEXT NOT NULL DEFAULT '',
 price_kopecks BIGINT NOT NULL CHECK(price_kopecks>=0),
 category TEXT NOT NULL,
 city TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','reserved','sold','archived','blocked')),
 create_request_key TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(seller_id,create_request_key)
);
CREATE TABLE IF NOT EXISTS listing_media(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
 storage_key TEXT NOT NULL,
 sort_order INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS placements(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
 community_id UUID NOT NULL REFERENCES communities(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected','removed')),
 reviewed_by UUID REFERENCES users(id),
 reviewed_at TIMESTAMPTZ,
 UNIQUE(listing_id,community_id)
);
CREATE TABLE IF NOT EXISTS favorites(
 user_id UUID NOT NULL REFERENCES users(id),
 listing_id UUID NOT NULL REFERENCES listings(id),
 PRIMARY KEY(user_id,listing_id)
);
CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(city,category,created_at DESC) WHERE status='active';
