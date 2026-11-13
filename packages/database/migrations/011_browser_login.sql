CREATE TABLE IF NOT EXISTS browser_login_requests (
 token_hash CHAR(64) PRIMARY KEY,
 code_hash CHAR(64) NOT NULL UNIQUE,
 user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_browser_login_expiry ON browser_login_requests(expires_at);
