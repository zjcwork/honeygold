// Node-based local development fallback for macOS versions unsupported by workerd.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
mkdirSync('.local', { recursive: true });
const sqlite = new DatabaseSync('.local/honeygold.sqlite');
sqlite.exec(
  'PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY)',
);
if (existsSync('drizzle'))
  for (const name of readdirSync('drizzle')
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    if (
      !sqlite.prepare('SELECT name FROM _migrations WHERE name=?').get(name)
    ) {
      sqlite.exec('BEGIN');
      try {
        sqlite.exec(readFileSync('drizzle/' + name, 'utf8'));
        sqlite.prepare('INSERT INTO _migrations VALUES(?)').run(name);
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    }
  }
class Statement {
  constructor(
    public sql: string,
    public args: any[] = [],
  ) {}
  bind(...args: any[]) {
    return new Statement(this.sql, args);
  }
  async first() {
    return sqlite.prepare(this.sql).get(...this.args) || null;
  }
  async all() {
    return { results: sqlite.prepare(this.sql).all(...this.args) };
  }
  async run() {
    const r = sqlite.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}
export const env: any = {
  ...process.env,
  DEMO_MODE: process.env.DEMO_MODE ?? 'true',
  DB: {
    prepare: (sql: string) => new Statement(sql),
    batch: async (stmts: Statement[]) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out = [];
        for (const stmt of stmts) out.push(await stmt.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  },
};
