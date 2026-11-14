import { useState } from 'react';
import { m } from 'motion/react';
import { Pencil } from 'lucide-react';
import { NICKNAME_MAX, graphemeLength, normalizeNickname } from '@sq/shared';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Dialog';
import { TextField } from '@/ui/fields';
import type { GameState } from '@/stores/game.reducer';
import { Avatar } from '@/ui/display';
import { AvatarCloud } from '@/game/AvatarCloud';
import { CountUp, ShapeDrift, WaitingDots } from '@/game/effects';
import { spring } from '@/design/motion';

/** Resolves with null on success, or the message to show under the field. */
export type RenameFn = (nickname: string) => Promise<string | null>;

function RenameDialog({ open, onOpenChange, current, onRename }: { open: boolean; onOpenChange: (v: boolean) => void; current: string; onRename: RenameFn }) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const len = graphemeLength(normalizeNickname(value));

  const submit = async () => {
    if (len < 1 || len > NICKNAME_MAX) return setError(`닉네임은 1~${NICKNAME_MAX}자로 입력해 주세요.`);
    setBusy(true);
    const err = await onRename(value);
    setBusy(false);
    if (err) setError(err);
    else onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setValue(current);
          setError(null);
        }
        onOpenChange(v);
      }}
      title="닉네임 변경"
      description="퀴즈가 시작되기 전까지만 바꿀 수 있어요."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            변경하기
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label="새 닉네임"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          counter={`${len}/${NICKNAME_MAX}`}
          error={error}
          autoComplete="nickname"
          enterKeyHint="done"
          maxLength={40}
        />
      </form>
    </Modal>
  );
}

export function LobbyScreen({ state, onRename }: { state: GameState; onRename?: RenameFn }) {
  const me = state.me!;
  const midGame = state.room && state.room.phase !== 'LOBBY';
  const [renameOpen, setRenameOpen] = useState(false);
  const canRename = !!onRename && state.room?.phase === 'LOBBY';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="relative overflow-hidden bg-spark-400 px-6 pt-8 pb-10 text-center text-ink">
        <ShapeDrift />
        <m.h1
          className="relative font-display text-[2rem] leading-tight"
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={spring.bouncy}
        >
          {midGame ? '곧 다음 문제부터 참여해요!' : '곧 시작해요!'}
        </m.h1>
        <p className="relative mt-1 flex items-center justify-center gap-2 font-semibold">
          진행자가 문제를 낼 때까지 기다려 주세요 <WaitingDots />
        </p>
        <div className="relative mt-6 flex flex-col items-center gap-3">
          <m.div className="motion-loop animate-float" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy}>
            <Avatar id={me.id} name={me.nickname} size={96} me />
          </m.div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-black text-spark-400">나</span>
            <span className="max-w-[14rem] truncate text-xl font-extrabold" title={me.nickname}>
              {me.nickname}
            </span>
            {canRename && (
              <button
                type="button"
                onClick={() => setRenameOpen(true)}
                className="inline-flex size-9 items-center justify-center rounded-full bg-ink/10 text-ink hover:bg-ink/20"
                aria-label="닉네임 변경"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </section>
      <section className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-5 pb-safe">
        <h2 className="text-center font-bold text-fg-muted">
          함께하는 사람 <CountUp value={state.rosterCount} className="text-lg font-black text-fg" />명
        </h2>
        <div className="fade-mask-y min-h-0 flex-1 overflow-y-auto py-2">
          <AvatarCloud roster={state.roster} total={state.rosterCount} meId={me.id} max={50} size={32} />
        </div>
      </section>
      {onRename && <RenameDialog open={renameOpen && canRename} onOpenChange={setRenameOpen} current={me.nickname} onRename={onRename} />}
    </div>
  );
}
