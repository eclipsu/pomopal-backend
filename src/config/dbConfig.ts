import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';

function resolveSsl():
  | false
  | { rejectUnauthorized: boolean } {
  if (process.env.DB_SSL === 'true') {
    return { rejectUnauthorized: false };
  }
  if (process.env.DB_SSL === 'false') {
    return false;
  }
  const host = process.env.DB_HOST ?? '';
  if (host.includes('neon.tech')) {
    return { rejectUnauthorized: false };
  }
  return false;
}

export default (): PostgresConnectionOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: true,
  migrationsRun: true,
  ssl: resolveSsl(),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
});
