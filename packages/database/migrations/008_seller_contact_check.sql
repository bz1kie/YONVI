ALTER TABLE users DROP CONSTRAINT IF EXISTS users_max_contact_url_check;
ALTER TABLE users ADD CONSTRAINT users_max_contact_url_check CHECK (max_contact_url IS NULL OR (length(max_contact_url)<=273 AND max_contact_url ~ '^https://max[.]ru/u/[A-Za-z0-9_-]+$'));
