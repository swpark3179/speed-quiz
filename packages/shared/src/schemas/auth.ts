import '../zod-ko';
import { z } from 'zod';

export const LoginInput = z.object({
  username: z.string().trim().min(1, '아이디를 입력해 주세요.').max(40),
  password: z.string().min(1, '비밀번호를 입력해 주세요.').max(200),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const PASSWORD_MIN = 8;

export const PasswordChangeInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(PASSWORD_MIN, `비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.`).max(200),
});

export const AdminCreateInput = z.object({
  username: z
    .string()
    .trim()
    .min(3, '아이디는 3자 이상이어야 해요.')
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, '아이디는 영문, 숫자, . _ - 만 사용할 수 있어요.'),
  displayName: z.string().trim().min(1).max(40),
  password: z.string().min(PASSWORD_MIN, `비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.`).max(200),
});
export type AdminCreateInput = z.infer<typeof AdminCreateInput>;

export const AdminPatchInput = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(PASSWORD_MIN).max(200).optional(),
});

export type AdminRole = 'MAIN' | 'ADMIN';

export const ProfilePatchInput = z.object({
  displayName: z.string().trim().min(1, '이름을 입력해 주세요.').max(40),
});

export interface AdminDto {
  id: number;
  username: string;
  displayName: string;
  role: AdminRole;
  disabled: boolean;
  createdAt: number;
  lastLoginAt: number | null;
}
