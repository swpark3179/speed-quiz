import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AnimatePresence, m, useAnimationControls } from 'motion/react';
import { ArrowRight, Pencil } from 'lucide-react';
import { NICKNAME_MAX, graphemeLength, normalizeNickname } from '@sq/shared';
import { ApiError, get, post } from '@/lib/api';
import { spring } from '@/design/motion';
import { haptic, HAPTIC } from '@/design/haptics';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/fields';
import { Logo } from '@/ui/display';
import { ShapeDrift } from '@/game/effects';
import { ChoiceShape } from '@/game/ChoiceShape';
import { useDocumentTitle } from '@/hooks/dom';
import { lastNickname, loadSession, saveSession } from '@/stores/session';
import { cn } from '@/lib/format';

interface RoomInfo {
  id: number;
  title: string;
  phase: string;
  joinable: boolean;
}

const SHAKE = { x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.42 } };

/** Six visual cells over one real numeric input (paste / OTP autofill friendly). */
function CodeInput({ value, onChange, invalid, autoFocus }: { value: string; onChange: (v: string) => void; invalid?: boolean; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <label htmlFor="room-code" className="sr-only">
        방 코드 6자리
      </label>
      <input
        ref={ref}
        id="room-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        autoFocus={autoFocus}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        aria-invalid={invalid || undefined}
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => {
          const ch = value[i];
          const active = focused && (i === value.length || (i === 5 && value.length === 6));
          return (
            <div
              key={i}
              className={cn(
                'tabular flex h-16 items-center justify-center rounded-md border-2 bg-surface text-3xl font-black transition-colors',
                invalid ? 'border-danger' : active ? 'border-info ring-4 ring-info/15' : ch ? 'border-ink' : 'border-n-300',
              )}
            >
              {ch ? (
                <m.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop}>
                  {ch}
                </m.span>
              ) : active ? (
                <span className="motion-loop h-8 w-0.5 animate-pulse-soft bg-info" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function JoinPage() {
  const params = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const urlCode = params.code && /^\d{6}$/.test(params.code) ? params.code : '';
  const [code, setCode] = useState(urlCode);
  const [lockedCode, setLockedCode] = useState(!!urlCode);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [nickname, setNickname] = useState(lastNickname());
  const [nickError, setNickError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const card = useAnimationControls();
  const nickRef = useRef<HTMLInputElement>(null);
  useDocumentTitle(room ? `${room.title} 참여` : '퀴즈 참여');

  // Resume: this phone already joined this room.
  useEffect(() => {
    if (urlCode && loadSession(urlCode)) navigate(`/play/${urlCode}`, { replace: true });
  }, [urlCode, navigate]);

  useEffect(() => {
    setRoom(null);
    setRoomError(null);
    if (code.length !== 6) return;
    const ctrl = new AbortController();
    setChecking(true);
    get<RoomInfo>(`/api/public/rooms/${code}`, ctrl.signal)
      .then((r) => {
        if (loadSession(code)) return navigate(`/play/${code}`);
        setRoom(r);
        if (!r.joinable) setRoomError('지금은 입장할 수 없어요. 진행자에게 문의해 주세요.');
        else window.setTimeout(() => nickRef.current?.focus(), 250);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setRoomError(err instanceof ApiError ? err.message : '퀴즈방을 찾을 수 없어요.');
        setLockedCode(false);
        haptic(HAPTIC.wrong);
        void card.start(SHAKE);
      })
      .finally(() => setChecking(false));
    return () => ctrl.abort();
  }, [code, card, navigate]);

  const nickLen = graphemeLength(normalizeNickname(nickname));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!room || !room.joinable) return;
    if (nickLen < 1 || nickLen > NICKNAME_MAX) {
      setNickError(`닉네임은 1~${NICKNAME_MAX}자로 입력해 주세요.`);
      void card.start(SHAKE);
      return;
    }
    setJoining(true);
    setNickError(null);
    try {
      const r = await post<{ participantId: number; token: string; roomId: number; code: string; title: string }>(
        `/api/public/rooms/${code}/join`,
        { nickname },
      );
      saveSession({ ...r, nickname: normalizeNickname(nickname) });
      haptic(HAPTIC.lock);
      navigate(`/play/${code}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '입장하지 못했어요. 다시 시도해 주세요.';
      if (err instanceof ApiError && (err.code === 'NICKNAME_TAKEN' || err.code === 'NICKNAME_INVALID')) setNickError(msg);
      else setRoomError(msg);
      haptic(HAPTIC.wrong);
      void card.start(SHAKE);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg">
      <div className="relative overflow-hidden bg-spark-400 pt-safe pb-14">
        <ShapeDrift />
        <div className="relative mx-auto flex max-w-md flex-col items-center gap-3 px-6 pt-6 text-center">
          <Logo className="text-2xl text-ink" />
          <div className="flex gap-2" aria-hidden="true">
            {(['circle', 'triangle', 'square', 'star'] as const).map((s, i) => (
              <m.span
                key={s}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...spring.pop, delay: 0.1 + i * 0.06 }}
                className="flex size-9 items-center justify-center rounded-sm"
                style={{ background: `var(--color-c${i + 1})` }}
              >
                <ChoiceShape shape={s} className="size-5" />
              </m.span>
            ))}
          </div>
        </div>
      </div>

      <main className="relative -mt-10 flex flex-1 justify-center px-4 pb-safe">
        <m.form
          onSubmit={submit}
          animate={card}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
          className="flex h-fit w-full max-w-md flex-col gap-6 rounded-xl bg-surface p-6 shadow-lg ring-1 ring-line/60 sm:p-8"
          noValidate
        >
          <div className="text-center">
            <h1 className="font-display text-3xl text-ink">퀴즈 참여하기</h1>
            <p className="mt-1 text-fg-muted">
              {room ? (
                <>
                  <b className="text-fg">{room.title}</b>에 오신 걸 환영해요!
                </>
              ) : (
                '진행자가 알려준 방 코드 6자리를 입력해 주세요.'
              )}
            </p>
          </div>

          {lockedCode && room ? (
            <div className="flex items-center justify-between rounded-md bg-n-50 px-4 py-3">
              <div>
                <p className="text-xs font-bold text-fg-muted">방 코드</p>
                <p className="tabular text-2xl font-black tracking-[0.2em]">{code}</p>
              </div>
              <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => setLockedCode(false)}>
                변경
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <CodeInput value={code} onChange={setCode} invalid={!!roomError && !room} autoFocus={!urlCode} />
              <p className={cn('min-h-5 text-center text-sm font-semibold', roomError ? 'text-danger-text' : 'text-fg-muted')} role={roomError ? 'alert' : undefined}>
                {roomError ?? (checking ? '퀴즈방을 찾는 중…' : room ? `✓ ${room.title}` : ' ')}
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {room?.joinable && (
              <m.div
                key="nick"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={spring.gentle}
                className="flex flex-col gap-6"
              >
                <TextField
                  ref={nickRef}
                  label="닉네임"
                  inputSize="lg"
                  placeholder="예) 번개처럼빠른곰"
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value);
                    setNickError(null);
                  }}
                  counter={`${nickLen}/${NICKNAME_MAX}`}
                  error={nickError}
                  hint="다른 참가자에게 보이는 이름이에요."
                  autoComplete="nickname"
                  enterKeyHint="go"
                  maxLength={40}
                />
                <Button type="submit" size="xl" block loading={joining} icon={!joining && <ArrowRight className="size-6" />}>
                  입장하기
                </Button>
              </m.div>
            )}
          </AnimatePresence>
        </m.form>
      </main>
    </div>
  );
}
