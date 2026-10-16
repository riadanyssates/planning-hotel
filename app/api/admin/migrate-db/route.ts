// TEMPORAIRE — copie l'ancienne base Turso (LIBSQL_*) vers la nouvelle (TURSO_*).
// À supprimer une fois lib/db basculé sur TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
import { NextResponse } from 'next/server';
import { createClient, type Client, type InValue } from '@libsql/client';
import { getDb } from '@/lib/db';
import { getManagerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Ordre de copie : parents avant enfants (clés étrangères vers employees).
const PRIORITY = ['employees'];
const CHUNK_BYTES = 1_000_000;

function getTarget(): Client | null {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) return null;
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

async function listTables(db: Client): Promise<{ name: string; sql: string }[]> {
  const res = await db.execute(
    `SELECT name, sql FROM sqlite_master
     WHERE type = 'table' AND sql IS NOT NULL
       AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' AND name NOT LIKE 'libsql_%'`
  );
  const tables = res.rows.map(r => ({ name: String(r.name), sql: String(r.sql) }));
  const rank = (n: string) => (PRIORITY.includes(n) ? PRIORITY.indexOf(n) : PRIORITY.length);
  return tables.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

async function countRows(db: Client, tables: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const t of tables) {
    try {
      const res = await db.execute(`SELECT count(*) AS n FROM "${t}"`);
      out[t] = Number(res.rows[0].n);
    } catch {
      out[t] = null; // table absente
    }
  }
  return out;
}

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function literal(v: InValue | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return `X'${Buffer.from(bytes).toString('hex')}'`;
  }
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Recrée le schéma puis remplace intégralement le contenu de chaque table cible
// par celui de la source : relancer la copie donne toujours le même résultat.
async function copyAll(source: Client, target: Client, tables: { name: string; sql: string }[]) {
  // 1. Schéma (tables + colonnes manquantes + index)
  for (const t of tables) {
    await target.execute(t.sql.replace(/^\s*CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?/i, 'CREATE TABLE IF NOT EXISTS '));
    const srcCols = await source.execute(`PRAGMA table_info(${quoteIdent(t.name)})`);
    const dstCols = await target.execute(`PRAGMA table_info(${quoteIdent(t.name)})`);
    const have = new Set(dstCols.rows.map(r => String(r.name)));
    for (const c of srcCols.rows) {
      if (have.has(String(c.name))) continue;
      const def = c.dflt_value !== null && c.dflt_value !== undefined ? ` DEFAULT ${c.dflt_value}` : '';
      await target.execute(`ALTER TABLE ${quoteIdent(t.name)} ADD COLUMN ${quoteIdent(String(c.name))} ${c.type || ''}${def}`);
    }
  }
  const idx = await source.execute(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`
  );
  for (const r of idx.rows) {
    await target.execute(String(r.sql).replace(/^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?/i, (_m, u) => `CREATE ${u || ''}INDEX IF NOT EXISTS `));
  }

  // 2. Vidage (enfants d'abord), clés étrangères désactivées sur ce flux
  const reversed = [...tables].reverse();
  await target.executeMultiple(
    'PRAGMA foreign_keys = OFF;\n' + reversed.map(t => `DELETE FROM ${quoteIdent(t.name)};`).join('\n')
  );

  // 3. Copie des lignes, par paquets d'~1 Mo
  for (const t of tables) {
    const res = await source.execute(`SELECT * FROM ${quoteIdent(t.name)}`);
    if (!res.rows.length) continue;
    const cols = res.columns.map(quoteIdent).join(', ');
    let chunk: string[] = [];
    let size = 0;
    const flush = async () => {
      if (!chunk.length) return;
      await target.executeMultiple('PRAGMA foreign_keys = OFF;\n' + chunk.join('\n'));
      chunk = [];
      size = 0;
    };
    for (const row of res.rows) {
      const values = res.columns.map((_, i) => literal(row[i] as InValue)).join(', ');
      const stmt = `INSERT INTO ${quoteIdent(t.name)} (${cols}) VALUES (${values});`;
      chunk.push(stmt);
      size += stmt.length;
      if (size >= CHUNK_BYTES) await flush();
    }
    await flush();
  }

  // 4. Compteurs AUTOINCREMENT alignés sur la source
  try {
    const seq = await source.execute('SELECT name, seq FROM sqlite_sequence');
    for (const r of seq.rows) {
      await target.execute({ sql: 'DELETE FROM sqlite_sequence WHERE name = ?', args: [r.name as InValue] });
      await target.execute({ sql: 'INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', args: [r.name as InValue, r.seq as InValue] });
    }
  } catch { /* pas de table AUTOINCREMENT */ }
}

async function report(source: Client, target: Client) {
  const tables = (await listTables(source)).map(t => t.name);
  const [oldCounts, newCounts] = await Promise.all([countRows(source, tables), countRows(target, tables)]);
  const rows = tables.map(t => ({ table: t, old: oldCounts[t], new: newCounts[t], match: oldCounts[t] === newCounts[t] }));
  return { rows, allMatch: rows.every(r => r.match) };
}

async function handle(copy: boolean) {
  const session = await getManagerSession();
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const target = getTarget();
  if (!target) return NextResponse.json({ error: 'TURSO_DATABASE_URL absente de cet environnement' }, { status: 500 });

  try {
    const source = await getDb(); // ancienne base, schéma à jour
    if (copy) await copyAll(source, target, await listTables(source));
    return NextResponse.json({ copied: copy, ...(await report(source, target)) });
  } catch (e) {
    console.error('migrate-db:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    target.close();
  }
}

// GET : compte seulement — POST : copie puis compte
export async function GET() {
  return handle(false);
}

export async function POST() {
  return handle(true);
}
