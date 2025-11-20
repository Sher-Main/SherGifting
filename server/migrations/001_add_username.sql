-- Ensure users table exists with required columns
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  privy_did VARCHAR(255) UNIQUE NOT NULL,
  wallet_address VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(30) UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add username column if table pre-existed without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'username'
  ) THEN
    ALTER TABLE users ADD COLUMN username VARCHAR(30) UNIQUE;
  END IF;
END$$;

-- Add updated_at if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE users ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END$$;

-- Enforce username format (@handle, 4-30 chars alphanumeric/underscore)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.constraint_column_usage
    WHERE table_name = 'users' AND constraint_name = 'username_format'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT username_format
    CHECK (username IS NULL OR username ~ '^@[a-zA-Z0-9_]{3,29}$');
  END IF;
END$$;

-- Create partial index for non-null usernames
CREATE INDEX IF NOT EXISTS idx_users_username
  ON users (username)
  WHERE username IS NOT NULL;

-- Trigger function to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


