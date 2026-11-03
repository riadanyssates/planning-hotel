import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getManagerSession } from '@/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getManagerSession();
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { id } = await params;
  const { name, color, department, role, contract_start, contract_end, hide_in_planning } = await req.json();
  const empRole = role === 'admin' ? 'admin' : 'employee';
  const db = await getDb();

  const result = await db.execute({
    sql: 'UPDATE employees SET name = ?, color = ?, department = ?, role = ?, contract_start = ?, contract_end = ?, hide_in_planning = ? WHERE id = ? RETURNING *',
    args: [name, color, department || 'Gestion Clientèle', empRole, contract_start || null, contract_end || null, hide_in_planning ? 1 : 0, Number(id)],
  });

  if (result.rows.length === 0) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getManagerSession();
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { id } = await params;
  const db = await getDb();
  await db.execute({ sql: 'DELETE FROM employees WHERE id = ?', args: [Number(id)] });
  return NextResponse.json({ ok: true });
}
