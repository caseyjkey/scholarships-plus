// Database health check script
// Verifies Postgres is running before migrations
import { Client } from 'pg';

async function checkDatabase() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'scholarships_plus'
  });

  try {
    await client.connect();
    console.log('✅ Database is running on port 5432');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database is not running on port 5432');
    console.error('Please start the Postgres Docker container:');
    console.error('  docker ps                    # Check if running');
    console.error('  docker start <container>     # Start if stopped');
    process.exit(1);
  }
}

checkDatabase();
