// Minimal async SQL layer with two backends:
//   • SQLite (node:sqlite) for local development and tests
//   • PostgreSQL (Supabase via `pg`, or PGlite in tests) for production
// The API writes SQLite-flavoured SQL; the Postgres adapter translates the handful of differences
// (placeholders, INSERT OR IGNORE, JSON/string aggregates) so the business logic exists only once.
import { AsyncLocalStorage } from 'node:async_hooks';

export type Params = unknown[] | [Record<string, unknown>];

export interface Sql {
  readonly dialect: 'sqlite' | 'postgres';
  one<T = any>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T = any>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
  /** Run fn atomically. Queries made inside fn (even via helpers) join the transaction automatically. */
  tx<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const isNamed = (p: unknown[]) =>
  p.length === 1 && p[0] !== null && typeof p[0] === 'object' && !Array.isArray(p[0]) && !(p[0] instanceof Date);

// ---------------------------------------------------------------- SQLite
type SqliteDb = import('node:sqlite').DatabaseSync;

export function sqliteSql(db: SqliteDb): Sql {
  const als = new AsyncLocalStorage<symbol>();
  let active: { token: symbol; done: Promise<void> } | null = null;

  // node:sqlite has one connection, so while a transaction is open every query that is *not* part of
  // it waits; otherwise an unrelated request's write could land inside (and roll back with) it.
  const gate = async () => {
    while (active && als.getStore() !== active.token) await active.done;
  };
  const exec = <R>(fn: () => R) => gate().then(fn);

  return {
    dialect: 'sqlite',
    one: (sql, ...p) => exec(() => db.prepare(sql).get(...(p as never[])) as any),
    all: (sql, ...p) => exec(() => db.prepare(sql).all(...(p as never[])) as any[]),
    run: (sql, ...p) => exec(() => ({ changes: Number(db.prepare(sql).run(...(p as never[])).changes) })),
    async tx(fn) {
      if (active && als.getStore() === active.token) return fn(); // nested: join outer transaction
      await gate();
      let release!: () => void;
      const token = Symbol('tx');
      active = { token, done: new Promise<void>((r) => (release = r)) };
      try {
        return await als.run(token, async () => {
          db.exec('BEGIN IMMEDIATE');
          try {
            const r = await fn();
            db.exec('COMMIT');
            return r;
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }
        });
      } finally {
        active = null;
        release();
      }
    },
    async close() { db.close(); },
  };
}

// ---------------------------------------------------------------- Postgres
/** Translate the SQLite-flavoured SQL used by the API into Postgres. Exported for tests. */
export function toPostgres(sql: string, params: unknown[]): { text: string; values: unknown[] } {
  let text = sql;
  let values: unknown[];
  if (isNamed(params)) {
    const named = params[0] as Record<string, unknown>;
    const order: string[] = [];
    text = text.replace(/\$([a-zA-Z_]\w*)/g, (_, name: string) => {
      let i = order.indexOf(name);
      if (i < 0) { order.push(name); i = order.length - 1; }
      return `$${i + 1}`;
    });
    values = order.map((n) => {
      if (!(n in named)) throw new Error(`Missing SQL parameter $${n}`);
      return named[n];
    });
  } else {
    let i = 0;
    text = text.replace(/\?/g, () => `$${++i}`);
    values = params;
  }
  if (/INSERT OR IGNORE INTO/i.test(text)) {
    text = text.replace(/INSERT OR IGNORE INTO/i, 'INSERT INTO').replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
  }
  text = text
    .replace(/json_group_object\(/g, 'json_object_agg(')
    .replace(/group_concat\((DISTINCT )?([^)]+)\)/g, "string_agg($1$2, ',')");
  return { text, values };
}

interface PgLike {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null; affectedRows?: number }>;
}

/** Build a Sql from anything with `query()`; `begin` must return a client bound to one connection. */
export function postgresSql(opts: {
  query: PgLike['query'];
  transaction: <T>(fn: (client: PgLike) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}): Sql {
  const als = new AsyncLocalStorage<PgLike>();
  const q = async (sql: string, params: unknown[]) => {
    const { text, values } = toPostgres(sql, params);
    const client = als.getStore();
    return client ? client.query(text, values) : opts.query(text, values);
  };
  return {
    dialect: 'postgres',
    one: async (sql, ...p) => (await q(sql, p)).rows[0],
    all: async (sql, ...p) => (await q(sql, p)).rows,
    run: async (sql, ...p) => {
      const r = await q(sql, p);
      return { changes: Number(r.rowCount ?? r.affectedRows ?? 0) };
    },
    tx(fn) {
      if (als.getStore()) return fn();
      return opts.transaction((client) => als.run(client, fn));
    },
    close: opts.close,
  };
}

/** Production: a pooled connection to Supabase (or any Postgres). */
export async function openPostgres(url: string, schemaSql: string): Promise<Sql> {
  const pg = await import('pg');
  const { Pool, types } = pg.default ?? pg;
  types.setTypeParser(20, (v: string) => Number(v)); // count(*) etc.
  types.setTypeParser(1184, (v: string) => new Date(v).toISOString()); // timestamptz → ISO, like SQLite
  types.setTypeParser(1114, (v: string) => new Date(v + 'Z').toISOString());
  // Supabase uses its own CA; set DATABASE_SSL_CA (PEM) to verify it, otherwise traffic is still encrypted.
  const ca = process.env.DATABASE_SSL_CA;
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]+/, ''),
    ssl: local ? undefined : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });
  await pool.query(schemaSql);
  return postgresSql({
    query: (t, v) => pool.query(t, v as any[]),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const r = await fn({ query: (t, v) => client.query(t, v as any[]) });
        await client.query('COMMIT');
        return r;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  });
}

/** Tests: a real Postgres engine compiled to WASM, in memory. */
export async function openPglite(schemaSql: string): Promise<Sql> {
  const { PGlite, types } = await import('@electric-sql/pglite');
  const db = new PGlite({
    parsers: {
      [types.INT8]: (v: string) => Number(v),
      [types.TIMESTAMPTZ]: (v: string) => new Date(v).toISOString(),
    },
  });
  await db.exec(schemaSql);
  // PGlite runs one query at a time; serialize transactions so non-transaction queries don't interleave.
  let chain: Promise<unknown> = Promise.resolve();
  return postgresSql({
    query: (t, v) => db.query(t, v as any[]),
    transaction(fn) {
      const run = chain.then(() => db.transaction((t) => fn({ query: (q, v) => t.query(q, v as any[]) })));
      chain = run.catch(() => undefined);
      return run as Promise<any>;
    },
    close: () => db.close(),
  });
}
