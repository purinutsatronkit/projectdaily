import { z } from 'zod';

export const priorities = ['low', 'medium', 'high'] as const;
export const statuses = ['pending', 'in_progress', 'completed'] as const;
export const TASK_STATUS_LABELS = { pending: 'ยังไม่เริ่ม', in_progress: 'กำลังทำ', completed: 'เสร็จแล้ว' };
export const PRIORITY_LABELS = { low: 'ต่ำ', medium: 'ปกติ', high: 'สูง' };
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'วันที่ไม่ถูกต้อง');
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(200)), password: z.string().min(1).max(128) });
export const registerSchema = loginSchema.extend({ name: z.string().trim().min(2).max(80), password: z.string().min(12).max(128) });
export const forgotPasswordSchema = loginSchema.pick({ email: true });
export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, 'ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง กรุณาขอลิงก์ใหม่'),
  password: registerSchema.shape.password,
});
const taskFields = { title: z.string().trim().min(3).max(120), description: z.string().trim().max(2000), priority: z.enum(priorities), status: z.enum(statuses), due_date: dateSchema.nullable() };
export const taskSchema = z.object({ ...taskFields, description: taskFields.description.default(''), priority: taskFields.priority.default('medium'), status: taskFields.status.default('pending'), due_date: taskFields.due_date.default(null) });
// PATCH needs optional fields without create-time defaults, so missing fields stay unchanged.
export const taskUpdateSchema = z.object(taskFields).partial().refine(v => Object.keys(v).length > 0, 'ต้องระบุข้อมูลที่จะแก้ไข');
export const apiKeySchema = z.object({ name: z.string().trim().min(2).max(60) });
export const reminderSchema = z.object({ task_ids: z.array(z.string().min(1)).min(1).max(100), date: dateSchema, channel: z.literal('email') });
export interface User { id: string; name: string; email: string }
export interface Task { id: string; title: string; description: string; priority: typeof priorities[number]; status: typeof statuses[number]; due_date: string | null; created_at: string; updated_at: string }
export interface ApiKey { id: string; name: string; prefix: string; created_at: string; expires_at: string; revoked_at: string | null; last_used_at: string | null }
export interface Summary { total: number; pending: number; in_progress: number; completed: number; overdue: number }
export interface Reminder { id: string; task_id: string; task_title: string; notification_date: string; channel: string; created_at: string }
