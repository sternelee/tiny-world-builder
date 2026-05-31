import postgres from 'postgres';
import { getConnectionString } from '@netlify/database';

let _twSql = null;

export function getSql() {
  if (!_twSql) {
    const connectionString = process.env.NETLIFY_DB_URL || getConnectionString();
    _twSql = postgres(connectionString, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return _twSql;
}
