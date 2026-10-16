import { createClient, type Client } from '@libsql/client';

declare global {
  var __dbClient: Client | undefined;
  var __dbInitialized: boolean | undefined;
}

export function getClient(): Client {
  if (!global.__dbClient) {
    global.__dbClient = createClient({
      url: process.env.TURSO_DATABASE_URL || 'file:local.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return global.__dbClient;
}

export async function getDb(): Promise<Client> {
  const db = getClient();
  if (!global.__dbInitialized) {
    await initSchema(db);
    global.__dbInitialized = true;
  }
  return db;
}

async function initSchema(db: Client) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#AEC6CF',
      department TEXT NOT NULL DEFAULT 'Gestion Clientèle',
      access_token TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedule_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
      start_time TEXT,
      end_time TEXT,
      start_time2 TEXT,
      end_time2 TEXT,
      UNIQUE(employee_id, day_of_week)
    );

    CREATE TABLE IF NOT EXISTS schedule_exceptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      start_time2 TEXT,
      end_time2 TEXT,
      note TEXT,
      UNIQUE(employee_id, date)
    );

    CREATE TABLE IF NOT EXISTS paid_leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      leave_type TEXT NOT NULL DEFAULT 'cp',
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      leave_type TEXT NOT NULL DEFAULT 'cp',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      comment TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      rejection_reason TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS timeclock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      clocked_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      message TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reception_planning (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL,
      zone TEXT NOT NULL DEFAULT 'reception',
      day_of_week INTEGER NOT NULL DEFAULT 0,
      slot TEXT NOT NULL,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(week_start, zone, day_of_week, slot, employee_id)
    );

    CREATE TABLE IF NOT EXISTS reception_closed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL,
      zone TEXT NOT NULL DEFAULT 'reception',
      day_of_week INTEGER NOT NULL DEFAULT 0,
      slot TEXT NOT NULL,
      UNIQUE(week_start, zone, day_of_week, slot)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS late_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, date, type)
    );
  `);

  // Migrations — colonnes ajoutées progressivement
  const migrations = [
    "ALTER TABLE employees ADD COLUMN department TEXT NOT NULL DEFAULT 'Gestion Clientèle'",
    'ALTER TABLE schedule_templates ADD COLUMN start_time2 TEXT',
    'ALTER TABLE schedule_templates ADD COLUMN end_time2 TEXT',
    'ALTER TABLE schedule_exceptions ADD COLUMN start_time2 TEXT',
    'ALTER TABLE schedule_exceptions ADD COLUMN end_time2 TEXT',
    "ALTER TABLE paid_leaves ADD COLUMN leave_type TEXT NOT NULL DEFAULT 'cp'",
    "ALTER TABLE employees ADD COLUMN role TEXT NOT NULL DEFAULT 'employee'",
    "ALTER TABLE employees ADD COLUMN contract_start TEXT",
    "ALTER TABLE employees ADD COLUMN contract_end TEXT",
    "ALTER TABLE leave_requests ADD COLUMN certificate_data TEXT",
    "ALTER TABLE leave_requests ADD COLUMN certificate_name TEXT",
    "ALTER TABLE reception_planning ADD COLUMN day_of_week INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE reception_planning ADD COLUMN zone TEXT NOT NULL DEFAULT 'reception'",
    "ALTER TABLE reception_closed ADD COLUMN zone TEXT NOT NULL DEFAULT 'reception'",
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch { /* déjà présent */ }
  }

  await migrateReceptionPlanningConstraint(db);
  await migrateReceptionZones(db);
  await fixPunchesAfterMoroccoGmtSwitch(db);
}

// Le Maroc est passé définitivement à GMT le 20/09/2026, mais certains téléphones
// sont restés à l'ancienne heure (UTC+1) : leurs pointages ont été enregistrés
// avec 1 h de trop. On les recale sur l'heure réelle d'enregistrement (created_at,
// en UTC = heure marocaine). Ne touche QUE :
//   - les pointages à partir du 20/09/2026 (avant, UTC+1 était la bonne heure),
//   - ceux qui ont ~1 h d'avance sur leur heure d'enregistrement (±3 min),
//   - sans changement de jour.
// Idempotent : une fois corrigé, un pointage n'a plus d'écart et n'est plus repris.
async function fixPunchesAfterMoroccoGmtSwitch(db: Client) {
  try {
    await db.execute(`
      UPDATE timeclock
      SET clocked_at = strftime('%H:%M', created_at)
      WHERE date >= '2026-09-20'
        AND created_at IS NOT NULL
        AND date(created_at) = date
        AND abs((strftime('%s', date || ' ' || clocked_at) - strftime('%s', created_at)) / 60.0 - 60) <= 3
    `);
  } catch { /* ne bloque jamais le démarrage */ }
}

async function migrateReceptionZones(db: Client) {
  // reception_planning — add zone to UNIQUE if not already present
  try {
    const res = await db.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='reception_planning'`);
    if (res.rows.length) {
      const sql = String(res.rows[0].sql || '').replace(/\s/g, '');
      if (!sql.includes('UNIQUE(week_start,zone')) {
        await db.execute(`CREATE TABLE IF NOT EXISTS reception_planning_z (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week_start TEXT NOT NULL,
          zone TEXT NOT NULL DEFAULT 'reception',
          day_of_week INTEGER NOT NULL DEFAULT 0,
          slot TEXT NOT NULL,
          employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(week_start, zone, day_of_week, slot, employee_id)
        )`);
        await db.execute(
          `INSERT OR IGNORE INTO reception_planning_z (id, week_start, zone, day_of_week, slot, employee_id, created_at)
           SELECT id, week_start, COALESCE(zone, 'reception'), day_of_week, slot, employee_id, created_at FROM reception_planning`
        );
        await db.execute('DROP TABLE reception_planning');
        await db.execute('ALTER TABLE reception_planning_z RENAME TO reception_planning');
      }
    }
  } catch (e) { console.error('reception_planning zone migration:', e); }

  // reception_closed — add zone to UNIQUE if not already present
  try {
    const res = await db.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='reception_closed'`);
    if (res.rows.length) {
      const sql = String(res.rows[0].sql || '').replace(/\s/g, '');
      if (!sql.includes('UNIQUE(week_start,zone')) {
        await db.execute(`CREATE TABLE IF NOT EXISTS reception_closed_z (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week_start TEXT NOT NULL,
          zone TEXT NOT NULL DEFAULT 'reception',
          day_of_week INTEGER NOT NULL DEFAULT 0,
          slot TEXT NOT NULL,
          UNIQUE(week_start, zone, day_of_week, slot)
        )`);
        await db.execute(
          `INSERT OR IGNORE INTO reception_closed_z (id, week_start, zone, day_of_week, slot)
           SELECT id, week_start, COALESCE(zone, 'reception'), day_of_week, slot FROM reception_closed`
        );
        await db.execute('DROP TABLE reception_closed');
        await db.execute('ALTER TABLE reception_closed_z RENAME TO reception_closed');
      }
    }
  } catch (e) { console.error('reception_closed zone migration:', e); }
}

async function migrateReceptionPlanningConstraint(db: Client) {
  try {
    const res = await db.execute(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='reception_planning'`
    );
    if (!res.rows.length) return;
    const normalizedSql = String(res.rows[0].sql || '').replace(/\s/g, '');
    // Skip if already has day_of_week or zone in UNIQUE (both are valid upgraded states)
    if (normalizedSql.includes('UNIQUE(week_start,day_of_week') || normalizedSql.includes('UNIQUE(week_start,zone')) return;

    await db.execute(`CREATE TABLE IF NOT EXISTS reception_planning_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL,
      day_of_week INTEGER NOT NULL DEFAULT 0,
      slot TEXT NOT NULL,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(week_start, day_of_week, slot, employee_id)
    )`);
    await db.execute(
      `INSERT OR IGNORE INTO reception_planning_new (id, week_start, day_of_week, slot, employee_id, created_at)
       SELECT id, week_start, COALESCE(day_of_week, 0), slot, employee_id, created_at FROM reception_planning`
    );
    await db.execute('DROP TABLE reception_planning');
    await db.execute('ALTER TABLE reception_planning_new RENAME TO reception_planning');
  } catch (e) {
    console.error('reception_planning migration error:', e);
  }
}
