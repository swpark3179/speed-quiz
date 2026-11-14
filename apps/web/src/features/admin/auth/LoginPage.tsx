import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { m } from 'motion/react';
import { LogIn } from 'lucide-react';
import { LoginInput } from '@sq/shared';
import { errorText, post } from '@/lib/api';
import { screenVariants } from '@/design/motion';
import { useDocumentTitle } from '@/hooks/dom';
import { Button } from '@/ui/Button';
import { Logo } from '@/ui/display';
import { TextField } from '@/ui/fields';
import { ShapeDrift } from '@/game/effects';
import { meKey, useMe } from '../session';

function safeNext(next: string | null): string {
  if (next && next.startsWith('/admin') && !next.startsWith('//')) return next;
  return '/admin/rooms';
}

export default function LoginPage() {
  useDocumentTitle('관리자 로그인');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me.data) return <Navigate to={next} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = LoginInput.safeParse({ username, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '아이디와 비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post('/api/auth/login', parsed.data);
      await qc.invalidateQueries({ queryKey: meKey });
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-spark-400 px-4 py-10">
      <ShapeDrift />
      <m.div
        variants={screenVariants}
        initial="initial"
        animate="animate"
        className="relative w-full max-w-[400px] rounded-xl bg-surface p-7 shadow-lg md:p-8"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="text-2xl" />
          <p className="font-semibold text-fg-muted">관리자 화면에 로그인해 주세요</p>
        </div>
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <TextField
            label="아이디"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            label="비밀번호"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
          />
          <Button type="submit" variant="ink" size="lg" block loading={busy} icon={<LogIn className="size-5" />}>
            로그인
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-fg-muted">
          참여자이신가요?{' '}
          <a href="/join" className="font-bold text-info underline-offset-2 hover:underline">
            퀴즈 참여하기
          </a>
        </p>
      </m.div>
    </div>
  );
}
