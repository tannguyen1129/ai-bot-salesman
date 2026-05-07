import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

// Load root .env when running from workspace script.
dotenv.config({ path: path.join(repoRoot, '.env') });

const fallbackDatabaseUrl = `postgresql://${process.env.POSTGRES_USER ?? 'bot_salesman'}:${process.env.POSTGRES_PASSWORD ?? 'bot_salesman_dev'}@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB ?? 'bot_salesman'}`;
const connectionString = process.env.DATABASE_URL ?? fallbackDatabaseUrl;

const { Client } = pg;
const client = new Client({ connectionString });

const migrationsDir = path.resolve(__dirname, '..', 'migrations');

async function run() {
  await client.connect();

  try {
    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      console.log('No migration files found');
      return;
    }

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(fullPath, 'utf8');

      console.log(`Running migrations/${file}`);
      await client.query(sql);
    }

    console.log('Migrations completed');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
