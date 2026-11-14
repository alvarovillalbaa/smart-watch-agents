import pg from 'pg';
import { migrate } from './migrations.mjs';
if (!process.env.DATABASE_URL) throw Error('Set DATABASE_URL for the explicitly selected database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try { await migrate(pool); console.log('Watch Agents schema migrations applied or verified.'); }
finally { await pool.end(); }
