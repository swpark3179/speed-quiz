import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, UserPlus } from 'lucide-react';
import { DISPLAY_NAME_MAX, PASSWORD_MIN, SignupInput, type AdminDto } from '@sq/shared';
import { ApiError, errorText, post } from '@/lib/api';
import { useDocumentTitle } from '@/hooks/dom';
import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/display';
import { Checkbox, TextField } from '@/ui/fields';
import { meKey, useMe, useSignupEnabled } from '../session';
import { AuthShell } from './AuthShell';

type Field = 'username' | 'displayName' | 'password' | 'confirm' | 'acknowledge';

const FIELD_FOR_CODE: Partial<Record<string, Field>> = {
  USERNAME_TAKEN: 'username',
  DISPLAY_NAME_TAKEN: 'displayName',
};

/** Self-service admin sign-up: id, nickname and password only; auto-approved when both are unique. */
export default function SignupPage() {
  useDocumentTitle('관리자 가입');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const enabled = useSignupEnabled();
  const [form, setForm] = useState({ username: '', displayName: '', password: '', confirm: '' });
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<{ field: Field; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (me.data) return <Navigate to="/admin/rooms" replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const err = (f: Field) => (error?.field === f ? error.message : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = SignupInput.safeParse({ ...form, acknowledge: ack });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError({ field: (issue?.path[0] as Field) ?? 'username', message: issue?.message ?? '입력값을 확인해 주세요.' });
      return;
    }
    if (form.password !== form.confirm) {
      setError({ field: 'confirm', message: '비밀번호가 서로 달라요.' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const admin = await post<AdminDto>('/api/auth/signup', parsed.data);
      qc.setQueryData(meKey, admin);
      toast.success(`${admin.displayName}님, 환영해요! 바로 퀴즈를 만들어 보세요.`);
      navigate('/admin/rooms', { replace: true });
    } catch (e2) {
      const code = e2 instanceof ApiError ? e2.code : '';
      setError({ field: FIELD_FOR_CODE[code] ?? 'acknowledge', message: errorText(e2) });
      setBusy(false);
    }
  };

  const footer = (
    <p>
      이미 계정이 있으신가요?{' '}
      <Link to="/admin/login" className="font-bold text-info underline-offset-2 hover:underline">
        로그인
      </Link>
    </p>
  );

  if (enabled.isPending) {
    return (
      <AuthShell subtitle="관리자 가입" footer={footer}>
        <div className="flex justify-center py-10 text-n-400">
          <Spinner className="size-7" />
        </div>
      </AuthShell>
    );
  }

  if (!enabled.data?.enabled) {
    return (
      <AuthShell subtitle="관리자 가입" footer={footer}>
        <p className="rounded-md bg-n-100 px-4 py-6 text-center font-semibold text-fg-muted">
          지금은 가입을 받지 않고 있어요.
          <br />
          계정이 필요하면 메인 관리자에게 요청해 주세요.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="관리자 계정을 만들어요" footer={footer}>
      <div role="note" className="mb-5 flex gap-2.5 rounded-md bg-warning-tint px-4 py-3 text-sm font-semibold text-warning-text">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <ul className="flex flex-col gap-1.5">
          <li>
            <b>개인정보는 받지 않아요.</b> 아이디·닉네임·비밀번호만 저장하니, 실명이나 이메일·전화번호를 아이디나 닉네임으로 쓰지 마세요.
          </li>
          <li>
            <b>이 서비스는 예고 없이 언제든 종료</b>되거나 데이터(문제·퀴즈방·결과)가 삭제될 수 있어요. 중요한 자료는 따로 보관해 주세요.
          </li>
        </ul>
      </div>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <TextField
          label="아이디"
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          hint="로그인할 때 써요. 영문, 숫자, . _ - 만 쓸 수 있어요."
          value={form.username}
          onChange={set('username')}
          error={err('username')}
        />
        <TextField
          label="닉네임"
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="nickname"
          hint="관리자 화면에 보이는 이름이에요. 다른 관리자와 겹치면 안 돼요."
          value={form.displayName}
          onChange={set('displayName')}
          error={err('displayName')}
        />
        <TextField
          label="비밀번호"
          type="password"
          autoComplete="new-password"
          hint={`${PASSWORD_MIN}자 이상`}
          value={form.password}
          onChange={set('password')}
          error={err('password')}
        />
        <TextField
          label="비밀번호 확인"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set('confirm')}
          error={err('confirm')}
        />
        <div className="flex flex-col gap-1.5">
          <Checkbox
            checked={ack}
            onChange={setAck}
            className="items-start text-sm font-semibold [&_input]:mt-0.5"
            label="위 내용을 확인했고, 서비스가 언제든 종료될 수 있다는 데 동의해요."
          />
          {err('acknowledge') && (
            <p role="alert" className="text-sm font-semibold text-danger-text">
              {err('acknowledge')}
            </p>
          )}
        </div>
        <Button type="submit" variant="ink" size="lg" block loading={busy} disabled={!ack} icon={<UserPlus className="size-5" />}>
          가입하고 시작하기
        </Button>
      </form>
    </AuthShell>
  );
}
