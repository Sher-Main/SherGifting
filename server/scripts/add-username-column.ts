import 'dotenv/config';
import { pool } from '../database';

async function runMigration() {
  if (!pool) {
    throw new Error('Database connection is not configured. Please set DATABASE_URL.');
  }

  const client = await pool.connect();

  try {
    console.log('🔧 Starting username column migration...');
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS username VARCHAR(30)
    `);
    console.log('✅ Ensured username column exists');

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE table_name = 'users'
            AND constraint_name = 'unique_username'
        ) THEN
          ALTER TABLE users
          ADD CONSTRAINT unique_username UNIQUE (username);
        END IF;
      END;
      $$;
    `);
    console.log('✅ Ensured unique constraint exists');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username
      ON users(username)
      WHERE username IS NOT NULL
    `);
    console.log('✅ Ensured username index exists');

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE table_name = 'users'
            AND constraint_name = 'username_format'
        ) THEN
          ALTER TABLE users
          ADD CONSTRAINT username_format
          CHECK (username IS NULL OR username ~ '^@[a-zA-Z0-9_]{3,29}$');
        END IF;
      END;
      $$;
    `);
    console.log('✅ Ensured username format constraint exists');

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('✅ Ensured updated_at column exists');

    await client.query('COMMIT');
    console.log('🎉 Username migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Username migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

