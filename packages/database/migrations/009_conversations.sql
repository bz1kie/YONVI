CREATE TABLE IF NOT EXISTS conversations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 listing_id UUID NOT NULL REFERENCES listings(id),
 buyer_id UUID NOT NULL REFERENCES users(id),
 seller_id UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(listing_id,buyer_id),
 CHECK(buyer_id<>seller_id)
);
CREATE TABLE IF NOT EXISTS conversation_messages (
 id BIGSERIAL PRIMARY KEY,
 conversation_id UUID NOT NULL REFERENCES conversations(id),
 sender_id UUID NOT NULL REFERENCES users(id),
 text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 2000),
 request_key UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(conversation_id,sender_id,request_key)
);
CREATE INDEX IF NOT EXISTS conversation_buyer_updated ON conversations(buyer_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS conversation_seller_updated ON conversations(seller_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS conversation_messages_order ON conversation_messages(conversation_id,id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS message_notifications BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS conversation_notifications (
 message_id BIGINT PRIMARY KEY REFERENCES conversation_messages(id) ON DELETE CASCADE,
 recipient_id UUID NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','failed','unknown','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
