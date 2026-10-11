ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_subject TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_oidc_subject_uidx
  ON users (oidc_subject)
  WHERE oidc_subject IS NOT NULL;
