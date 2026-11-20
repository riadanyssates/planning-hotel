import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Employee } from '@/types';
import { notifyManagers } from '@/lib/notify';

type Ctx = { params: Promise<{ token: string }> };

async function resolveEmployee(token: string): Promise<Employee | null> {
  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM employees WHERE access_token = ?',
    args: [token],
  });
  return res.rows.length > 0 ? (res.rows[0] as unknown as Employee) : null;
}

// GET /api/employee/[token]/leave-requests
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const employee = await resolveEmployee(token);
  if (!employee) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT id, employee_id, leave_type, start_date, end_date, comment, status, rejection_reason, certificate_name, created_at FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC',
    args: [employee.id],
  });
  return NextResponse.json(res.rows);
}

// POST /api/employee/[token]/leave-requests
// { leaveType, startDate, endDate, comment?, certificateData?, certificateName? }
export async function POST(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const employee = await resolveEmployee(token);
  if (!employee) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  const { leaveType, startDate, endDate, comment, certificateData, certificateName } = await req.json();
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Dates manquantes' }, { status: 400 });
  }
  if (startDate > endDate) {
    return NextResponse.json({ error: 'Date de début après date de fin' }, { status: 400 });
  }

  const type = leaveType === 'cm' ? 'cm' : 'cp';

  // Validate certificate size (~3 MB base64 ≈ 4 MB encoded)
  if (certificateData && certificateData.length > 4_500_000) {
    return NextResponse.json({ error: 'Certificat trop volumineux (max 3 Mo)' }, { status: 400 });
  }

  const db = await getDb();
  const result = await db.execute({
    sql: `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, comment, certificate_data, certificate_name)
          VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, employee_id, leave_type, start_date, end_date, comment, status, certificate_name, created_at`,
    args: [employee.id, type, startDate, endDate, comment || null, certificateData || null, certificateName || null],
  });

  const typeLabel = type === 'cm' ? 'congé maladie' : 'congés payés';
  await notifyManagers(db, 'leave_request', employee.name,
    `${employee.name} a soumis une demande de ${typeLabel} (${startDate} → ${endDate})`,
    { push: true });

  return NextResponse.json(result.rows[0], { status: 201 });
}
