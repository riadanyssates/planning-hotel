export type EmployeeRole = 'employee' | 'admin';

export interface Employee {
  id: number;
  name: string;
  color: string;
  department: string;
  role: EmployeeRole;
  contract_start: string | null;
  contract_end: string | null;
  hide_in_planning?: number | null;  // 1 = n'apparaît dans aucune vue du planning
  access_token: string;
  created_at: string;
}

export type TimeclockType = 'arrival' | 'departure' | 'arrival2' | 'departure2';

export interface TimeclockEntry {
  id: number;
  employee_id: number;
  date: string;         // YYYY-MM-DD
  type: TimeclockType;
  clocked_at: string;   // HH:MM
  created_at: string;
}

export const DEPARTMENTS = ['Gestion Clientèle', 'Gestion Riad'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export interface ScheduleTemplate {
  id: number;
  employee_id: number;
  day_of_week: number; // 0=Lundi ... 6=Dimanche
  start_time: string | null;
  end_time: string | null;
  start_time2: string | null;
  end_time2: string | null;
}

export interface ScheduleException {
  id: number;
  employee_id: number;
  date: string; // YYYY-MM-DD
  start_time: string | null;
  end_time: string | null;
  start_time2: string | null;
  end_time2: string | null;
  note: string | null;
}

export type LeaveType = 'cp' | 'cm';

export interface DaySchedule {
  start_time: string | null;
  end_time: string | null;
  start_time2: string | null;
  end_time2: string | null;
  is_off: boolean;
  is_exception: boolean;
  is_leave: boolean;          // true for CP or CM
  leave_type: LeaveType | null;
  note?: string | null;
  hours: number;
}

export interface PaidLeave {
  id: number;
  employee_id: number;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  leave_type: LeaveType;
  note: string | null;
  created_at: string;
}

export interface EmployeeWeek {
  employee: Employee;
  days: Record<string, DaySchedule>;
  totalHours: number;
}

export interface MonthStats {
  employee: Employee;
  totalHours: number;
  weeklyBreakdown: Record<string, number>;
}

export const EMPLOYEE_COLORS = [
  '#AEC6CF', // bleu poudré
  '#C9B8D8', // lavande
  '#F4C5A8', // pêche
  '#B5C9B5', // sauge
  '#F0C0C0', // rose poudré
  '#B8D4E8', // bleu ciel
  '#F0E5A8', // jaune paille
  '#B8DDD0', // vert menthe
  '#D4B8D4', // mauve poudré
  '#C8D4A8', // vert olive doux
];

export const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const DAYS_FULL_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
