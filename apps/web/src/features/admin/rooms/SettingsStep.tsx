import { AnimatePresence, m } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import {
  SCORING_PRESETS,
  ScoringConfig,
  previewPoints,
  type RoomSettings,
  type ScoringConfig as ScoringConfigT,
  type ScoringMode,
} from '@sq/shared';
import { spring } from '@/design/motion';
import { cn, num } from '@/lib/format';
import { IconButton } from '@/ui/Button';
import { NumberField, Switch, TextField } from '@/ui/fields';
import { Medal, SectionCard } from '../components/common';

const MODES: ScoringMode[] = ['RANK_STEP', 'FLAT', 'RANK_TABLE', 'TIME_RATIO'];

export function PointsChart({ cfg }: { cfg: ScoringConfigT }) {
  const rows = previewPoints(cfg, 10);
  const max = Math.max(1, ...rows.map((r) => r.points));
  return (
    <div className="rounded-md bg-n-50 p-4" aria-label="순위별 점수 미리보기">
      <div className="flex h-36 items-end gap-1.5">
        {rows.map((r, i) => (
          <div key={r.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="tabular text-[10px] font-bold text-fg-muted sm:text-xs">{num(r.points)}</span>
            <m.div
              className="w-full origin-bottom rounded-t-sm"
              style={{ height: '100%', background: i === 0 ? 'var(--color-spark-400)' : 'var(--color-c2)' }}
              initial={false}
              animate={{ scaleY: r.points / max }}
              transition={spring.layout}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {rows.map((r) => (
          <span key={r.label} className="min-w-0 flex-1 truncate text-center text-[10px] font-bold text-fg-muted sm:text-xs">
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScoringParams({ cfg, onChange }: { cfg: ScoringConfigT; onChange: (c: ScoringConfigT) => void }) {
  switch (cfg.mode) {
    case 'FLAT':
      return <NumberField label="정답 점수" value={cfg.points} min={1} max={10000} step={10} suffix="점" onChange={(points) => onChange({ ...cfg, points })} />;
    case 'RANK_STEP':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="기본 점수" value={cfg.base} min={0} max={10000} step={50} suffix="점" onChange={(base) => onChange({ ...cfg, base })} />
          <NumberField label="1등 보너스" value={cfg.firstBonus} min={0} max={10000} step={50} suffix="점" onChange={(firstBonus) => onChange({ ...cfg, firstBonus })} />
          <NumberField label="순위마다 줄어드는 점수" value={cfg.step} min={0} max={10000} step={10} suffix="점" onChange={(step) => onChange({ ...cfg, step })} />
          <NumberField label="최소 보너스" value={cfg.minBonus} min={0} max={10000} step={10} suffix="점" onChange={(minBonus) => onChange({ ...cfg, minBonus })} />
        </div>
      );
    case 'RANK_TABLE':
      return (
        <div className="flex flex-col gap-4">
          <NumberField label="정답 기본 점수" value={cfg.base} min={0} max={10000} step={50} suffix="점" onChange={(base) => onChange({ ...cfg, base })} />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">순위별 보너스</span>
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {cfg.table.map((v, i) => (
                  <m.li
                    key={i}
                    layout="position"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    className="flex items-end gap-2"
                  >
                    <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-sm bg-n-100 text-sm font-black">{i + 1}등</span>
                    <div className="flex-1">
                      <NumberField
                        label={<span className="sr-only">{i + 1}등 보너스</span>}
                        value={v}
                        min={0}
                        max={10000}
                        step={50}
                        suffix="점"
                        onChange={(n) => onChange({ ...cfg, table: cfg.table.map((x, j) => (j === i ? n : x)) })}
                      />
                    </div>
                    <IconButton
                      label={`${i + 1}등 보너스 삭제`}
                      disabled={cfg.table.length <= 1}
                      onClick={() => onChange({ ...cfg, table: cfg.table.filter((_, j) => j !== i) })}
                      className="mb-1"
                    >
                      <Trash2 className="size-5" />
                    </IconButton>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
            <button
              type="button"
              disabled={cfg.table.length >= 20}
              onClick={() => onChange({ ...cfg, table: [...cfg.table, Math.max(0, (cfg.table.at(-1) ?? 100) - 50)] })}
              className="inline-flex h-11 w-fit items-center gap-1.5 rounded-sm px-3 text-sm font-bold text-info hover:bg-info-tint disabled:opacity-40"
            >
              <Plus className="size-4" /> 순위 추가
            </button>
          </div>
        </div>
      );
    case 'TIME_RATIO':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="즉시 답하면" value={cfg.maxPoints} min={1} max={10000} step={50} suffix="점" onChange={(maxPoints) => onChange({ ...cfg, maxPoints })} />
          <NumberField label="마감 직전에 답하면" value={cfg.minPoints} min={0} max={10000} step={50} suffix="점" onChange={(minPoints) => onChange({ ...cfg, minPoints })} />
        </div>
      );
  }
}

export function ScoringField({ cfg, onChange }: { cfg: ScoringConfigT; onChange: (c: ScoringConfigT) => void }) {
  const check = ScoringConfig.safeParse(cfg);
  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="점수 방식" className="grid gap-3 sm:grid-cols-2">
        {MODES.map((mode) => {
          const p = SCORING_PRESETS[mode];
          const active = cfg.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && onChange(p.config)}
              className={cn(
                'relative flex min-h-24 flex-col gap-1 rounded-md p-4 text-left ring-2 transition-all',
                active ? 'bg-spark-50 ring-spark-500' : 'bg-surface ring-line hover:ring-n-400',
              )}
            >
              <span className="flex items-center gap-2 font-extrabold">
                <span className={cn('flex size-5 items-center justify-center rounded-full ring-2', active ? 'ring-ink' : 'ring-n-400')}>
                  {active && <m.span layoutId="scoring-dot" className="size-2.5 rounded-full bg-ink" transition={spring.snappy} />}
                </span>
                {p.label}
                {mode === 'RANK_STEP' && <span className="rounded-full bg-ink px-2 text-[11px] font-bold text-white">추천</span>}
              </span>
              <span className="text-sm text-fg-muted">{p.description}</span>
            </button>
          );
        })}
      </div>
      <ScoringParams cfg={cfg} onChange={onChange} />
      {!check.success && <p className="text-sm font-semibold text-danger-text">{check.error.issues[0]?.message}</p>}
      <PointsChart cfg={cfg} />
    </div>
  );
}

export function SettingsStep({
  title,
  onTitle,
  settings,
  onSettings,
  titleError,
}: {
  title: string;
  onTitle: (t: string) => void;
  settings: RoomSettings;
  onSettings: (s: RoomSettings) => void;
  titleError?: string | null;
}) {
  const set = <K extends keyof RoomSettings>(k: K, v: RoomSettings[K]) => onSettings({ ...settings, [k]: v });
  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="기본 정보">
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label="퀴즈방 이름"
            placeholder="예: 3분기 타운홀 스피드 퀴즈"
            value={title}
            maxLength={60}
            onChange={(e) => onTitle(e.target.value)}
            error={titleError}
            counter={`${title.length}/60`}
            wrapperClassName="md:col-span-2"
          />
          <NumberField
            label="기본 제한시간"
            value={settings.defaultTimeLimitSec}
            min={5}
            max={300}
            step={5}
            suffix="초"
            onChange={(v) => set('defaultTimeLimitSec', v)}
            hint="문제마다 따로 정하지 않았을 때 사용해요."
          />
          <NumberField
            label="출제 전 준비 시간"
            value={settings.readyCountdownSec}
            min={0}
            max={10}
            suffix="초"
            onChange={(v) => set('readyCountdownSec', v)}
            hint="문제를 먼저 읽고, 보기는 준비 시간이 끝나면 열려요."
          />
        </div>
      </SectionCard>

      <SectionCard title="점수 방식" description="정답을 맞힌 사람끼리도 순서에 따라 점수를 다르게 줄 수 있어요.">
        <ScoringField cfg={settings.scoring} onChange={(c) => set('scoring', c)} />
      </SectionCard>

      <SectionCard title="시상" description="최종 순위 발표 후 진행 화면에서 시상식 애니메이션이 나와요.">
        <div className="grid items-end gap-5 md:grid-cols-[minmax(0,240px)_1fr]">
          <NumberField label="상품 받는 인원" value={settings.prizeCount} min={0} max={10} suffix="명" onChange={(v) => set('prizeCount', v)} />
          <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-md bg-n-50 px-3 py-2" aria-hidden="true">
            {settings.prizeCount === 0 ? (
              <span className="text-sm font-semibold text-fg-muted">시상식 없이 최종 순위만 보여줘요.</span>
            ) : (
              <AnimatePresence initial={false}>
                {Array.from({ length: settings.prizeCount }, (_, i) => (
                  <m.span
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0, transition: { duration: 0.1 } }}
                    transition={spring.pop}
                  >
                    <Medal rank={i + 1} />
                  </m.span>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="진행 옵션">
        <div className="flex flex-col divide-y divide-line">
          <div className="pb-3">
            <Switch
              checked={settings.autoCloseWhenAllAnswered}
              onChange={(v) => set('autoCloseWhenAllAnswered', v)}
              label="모두 응답하면 자동 마감"
              description="접속 중인 모든 참여자가 답하면 제한시간 전이라도 바로 정답을 공개해요."
            />
          </div>
          <div className="py-3">
            <Switch
              checked={settings.showLeaderboardAfterEach}
              onChange={(v) => set('showLeaderboardAfterEach', v)}
              label="문제마다 순위 보여주기"
              description="정답 공개 다음에 현재 순위표를 보여줘요."
            />
          </div>
          <div className="py-3">
            <Switch
              checked={settings.showQuestionOnDevices}
              onChange={(v) => set('showQuestionOnDevices', v)}
              label="휴대폰에도 문제 보여주기"
              description="끄면 휴대폰에는 보기 버튼만 나오고, 문제는 진행 화면에서만 보여요."
            />
          </div>
          <div className="pt-3">
            <Switch
              checked={settings.allowLateJoin}
              onChange={(v) => set('allowLateJoin', v)}
              label="중간 입장 허용"
              description="퀴즈가 시작된 뒤에도 새 참여자가 들어올 수 있어요."
            />
          </div>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <NumberField label="최대 참여 인원" value={settings.maxParticipants} min={2} max={1000} step={10} suffix="명" onChange={(v) => set('maxParticipants', v)} />
          <NumberField label="순위표에 보여줄 인원" value={settings.leaderboardSize} min={3} max={20} suffix="명" onChange={(v) => set('leaderboardSize', v)} />
        </div>
      </SectionCard>
    </div>
  );
}
