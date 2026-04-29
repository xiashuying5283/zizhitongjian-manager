import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[数据库连接池错误]', err.message);
});

export function startPoolHealthCheck(intervalMs = 30000) {
  return setInterval(async () => {
    try {
      await pool.query('SELECT 1');
    } catch (e) {
      console.error('[数据库健康检查失败]', (e as Error).message);
    }
  }, intervalMs);
}
