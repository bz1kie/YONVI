ALTER TABLE users ADD COLUMN IF NOT EXISTS max_contact_url TEXT CHECK (max_contact_url IS NULL OR max_contact_url ~ '^https://max[.]ru/u/[A-Za-z0-9_-]{1,256}$');
