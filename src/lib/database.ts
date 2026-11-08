import { readFileSync } from 'node:fs';
import { Pool, types, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

export interface Database extends Queryable {
  readonly schema: string;
  transaction<T>(operation: (client: Queryable) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

/** Retain useful SQLSTATE classification without retaining driver messages or credentials. */
export class DatabaseError extends Error {
  readonly status = 503;
  readonly code?: string;
  constructor(error: unknown, message = 'Database operation failed.') {
    super(message);
    this.name = 'DatabaseError';
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code)) this.code = error.code;
  }
}

function safeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('Database integer exceeds the supported safe range.');
  return parsed;
}

function poolConfiguration(connectionUrl: string, schema: string): PoolConfig {
  try {
    const url = new URL(connectionUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1) || url.hash) throw new Error();
    // Decompose the URL rather than allowing its parameters to replace TLS or search_path.
    if ([...url.searchParams.keys()].some(key => !['sslmode', 'sslrootcert'].includes(key))) throw new Error();
    const mode = url.searchParams.get('sslmode') || 'verify-full';
    if (!['disable', 'require', 'verify-ca', 'verify-full'].includes(mode)) throw new Error();
    const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
    if (mode === 'disable' && !loopback) throw new Error();
    const maximum = process.env.PG_POOL_MAX === undefined ? 5 : Number(process.env.PG_POOL_MAX);
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 20) throw new Error();
    const caFile = process.env.PGSSLROOTCERT || process.env.DATABASE_SSL_CA_FILE || url.searchParams.get('sslrootcert');
    const port = url.port ? Number(url.port) : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
    return {
      host: url.hostname.replace(/^\[|\]$/g, ''), port,
      database: decodeURIComponent(url.pathname.slice(1)),
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      ssl: mode === 'disable' ? false : { rejectUnauthorized: true, ...(caFile ? { ca: readFileSync(caFile, 'utf8') } : {}) },
      max: maximum, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
      query_timeout: 15000, statement_timeout: 15000, idle_in_transaction_session_timeout: 15000,
      application_name: 'midnight-ink', options: `-c search_path=${schema}`,
      // Keep the application's ISO strings and millisecond authentication numbers stable.
      types: { getTypeParser(oid, format) {
        if (format !== 'binary' && oid === types.builtins.INT8) return safeInteger;
        if (format !== 'binary' && oid === types.builtins.TIMESTAMPTZ) return (value: string) => new Date(value).toISOString();
        return types.getTypeParser(oid, format);
      } },
    };
  } catch {
    throw new DatabaseError(undefined, 'PostgreSQL configuration is invalid. Use a valid DATABASE_URL, verified TLS, and PG_POOL_MAX between 1 and 20.');
  }
}

/** Pool creation is lazy: this function does not connect, migrate, or seed. */
export function createDatabase(connectionUrl: string, options: { schema?: string } = {}): Database {
  const schema = options.schema ?? process.env.DATABASE_SCHEMA ?? 'public';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new DatabaseError(undefined, 'DATABASE_SCHEMA is invalid.');
  const pool = new Pool(poolConfiguration(connectionUrl, schema));
  // Idle-client failures must not become uncaught process errors; queries report safe failures.
  pool.on('error', () => {});
  const wrap = (client: Pick<Pool, 'query'>): Queryable => ({
    async query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
      try { return await client.query<R>(text, values); }
      catch (error) { throw new DatabaseError(error); }
    },
  });
  let ending: Promise<void> | undefined;
  const database: Database = {
    schema,
    ...wrap(pool),
    async transaction<T>(operation: (client: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect().catch(error => { throw new DatabaseError(error); });
      const tx = wrap(client);
      let discard = false;
      try {
        await tx.query('BEGIN');
        const result = await operation(tx);
        await tx.query('COMMIT');
        return result;
      } catch (error) {
        try { await tx.query('ROLLBACK'); } catch { discard = true; }
        throw error;
      } finally { client.release(discard); }
    },
    async end() {
      ending ??= pool.end().finally(() => {
        registry().all.delete(database);
        for (const [key, value] of registry().shared) if (value === database) registry().shared.delete(key);
      });
      await ending;
    },
  };
  registry().all.add(database);
  hooks[shutdownKey] = closeDatabase;
  return database;
}

const shutdownKey = Symbol.for('midnight-ink.database.shutdown');
const registryKey = Symbol.for('midnight-ink.database.registry');
const hooks = globalThis as typeof globalThis & { [key: symbol]: unknown };
type Registry = { shared: Map<string, Database>; all: Set<Database> };
function registry(): Registry {
  hooks[registryKey] ??= { shared: new Map<string, Database>(), all: new Set<Database>() };
  return hooks[registryKey] as Registry;
}

export function getDatabase(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new DatabaseError(undefined, 'DATABASE_URL is required.');
  const schema = process.env.DATABASE_SCHEMA ?? 'public';
  const key = JSON.stringify([url, schema]);
  const shared = registry().shared;
  if (!shared.has(key)) shared.set(key, createDatabase(url, { schema }));
  return shared.get(key)!;
}

export async function closeDatabase(): Promise<void> {
  const databases = [...registry().all];
  registry().shared.clear();
  delete hooks[shutdownKey];
  const outcomes = await Promise.allSettled(databases.map(database => database.end()));
  if (outcomes.some(outcome => outcome.status === 'rejected')) throw new Error('Database shutdown failed.');
}
