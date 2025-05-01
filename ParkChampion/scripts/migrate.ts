import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, pool } from '../server/db';

// Handle migrations
async function main() {
  console.log('Running migrations...');
  
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();