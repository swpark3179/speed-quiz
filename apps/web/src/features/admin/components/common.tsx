import { useState, type ReactNode } from 'react';
import { m } from 'motion/react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { PasswordChangeInput } from '@sq/shared';
import { spring } from '@/design/motion';
import { errorText } from '@/lib/api';
import { cn } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Dialog';
import { TextField } from '@/ui/fields';
import { useChangePassword } from '../api';

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back && <div className="mb-2">{back}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export async function copyText(text: string, label = '링크'): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // http:// on a LAN IP is not a secure context — fall back to a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast.success(`${label}를 복사했어요.`);
  } catch {
    toast.error('복사하지 못했어요. 직접 선택해서 복사해 주세요.');
  }
}

export function CopyField({ label, value, copyLabel }: { label: string; value: string; copyLabel?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="h-12 min-w-0 flex-1 rounded-md border-2 border-n-200 bg-n-50 px-3 font-mono text-sm text-fg"
          aria-label={label}
        />
        <Button
          variant="subtle"
          onClick={async () => {
            await copyText(value, copyLabel ?? label);
            setDone(true);
            window.setTimeout(() => setDone(false), 1500);
          }}
          icon={done ? <Check className="size-4" /> : <Copy className="size-4" />}
          aria-label={`${label} 복사`}
        >
          복사
        </Button>
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
  actions,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-lg bg-surface p-5 shadow-sm ring-1 ring-line/60 md:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-extrabold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col', className)}>
      <span className="text-xs font-bold text-fg-muted">{label}</span>
      <span className="tabular text-lg font-extrabold">{value}</span>
    </div>
  );
}

/** Animated horizontal bar (scaleX from 0 → value). */
export function HBar({ value, color, className }: { value: number; color: string; className?: string }) {
  return (
    <div className={cn('h-3 w-full overflow-hidden rounded-full bg-n-100', className)}>
      <m.div
        className="h-full origin-left rounded-full"
        style={{ background: color }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: Math.max(0, Math.min(1, value)) }}
        transition={spring.layout}
      />
    </div>
  );
}

export function PasswordChangeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const change = useChangePassword();

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  };

  const submit = async () => {
    const parsed = PasswordChangeInput.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.');
    if (next !== confirm) return setError('새 비밀번호가 서로 달라요.');
    try {
      await change.mutateAsync(parsed.data);
      toast.success('비밀번호를 변경했어요. 다른 기기의 로그인은 해제돼요.');
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="비밀번호 변경"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button loading={change.isPending} onClick={submit}>
            변경하기
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label="현재 비밀번호" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <TextField label="새 비밀번호" type="password" autoComplete="new-password" hint="8자 이상" value={next} onChange={(e) => setNext(e.target.value)} />
        <TextField
          label="새 비밀번호 확인"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={error}
        />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

/** Small pill showing the question kind. */
export function KindBadge({ kind }: { kind: 'TEXT' | 'HTML' }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-black tracking-wide',
        kind === 'HTML' ? 'bg-c3-tint text-c3-edge' : 'bg-c2-tint text-c2-edge',
      )}
    >
      {kind === 'HTML' ? 'HTML' : '텍스트'}
    </span>
  );
}

export function Medal({ rank, className }: { rank: number; className?: string }) {
  const color = rank === 1 ? 'bg-gold' : rank === 2 ? 'bg-silver' : rank === 3 ? 'bg-bronze' : 'bg-spark-200';
  return (
    <span
      className={cn('inline-flex size-7 items-center justify-center rounded-full text-xs font-black text-ink shadow-xs', color, className)}
      aria-label={`${rank}등 수상`}
    >
      {rank}
    </span>
  );
}
