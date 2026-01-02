import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';

export default (): PostgresConnectionOptions => ({
  type: 'postgres',
  // host: process.env.DB_HOST,
  // port: Number(process.env.DB_PORT) || 5432,
  // username: process.env.DB_USER,
  // password: process.env.DB_PASSWORD,
  // database: process.env.DB_NAME,
  url: process.env.DATABASE_URL,
  synchronize: true,
  migrationsRun: true,
  ssl: true,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
});
