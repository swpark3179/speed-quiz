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

const Username = z
  .string()
  .trim()
  .min(3, '아이디는 3자 이상이어야 해요.')
  .max(40, '아이디는 40자 이하로 입력해 주세요.')
  .regex(/^[a-zA-Z0-9._-]+$/, '아이디는 영문, 숫자, . _ - 만 사용할 수 있어요.');
export const DISPLAY_NAME_MAX = 20;
const DisplayName = z
  .string()
  .trim()
  .min(1, '닉네임을 입력해 주세요.')
  .max(DISPLAY_NAME_MAX, `닉네임은 ${DISPLAY_NAME_MAX}자 이하로 입력해 주세요.`);
const NewPassword = z.string().min(PASSWORD_MIN, `비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.`).max(200);

export const AdminCreateInput = z.object({
  username: Username,
  displayName: DisplayName,
  password: NewPassword,
});
export type AdminCreateInput = z.infer<typeof AdminCreateInput>;

export type AdminRole = 'MAIN' | 'ADMIN';

export const AdminPatchInput = z.object({
  displayName: DisplayName.optional(),
  disabled: z.boolean().optional(),
  password: NewPassword.optional(),
  role: z.enum(['MAIN', 'ADMIN']).optional(),
});
export type AdminPatchInput = z.infer<typeof AdminPatchInput>;

/** Self-service sign-up: no personal data beyond an id, a nickname and a password. */
export const SignupInput = z.object({
  username: Username,
  displayName: DisplayName,
  password: NewPassword,
  acknowledge: z.literal(true, { error: '서비스 종료 가능성 안내를 확인해 주세요.' }),
});
export type SignupInput = z.infer<typeof SignupInput>;

export const ProfilePatchInput = z.object({
  displayName: DisplayName,
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
