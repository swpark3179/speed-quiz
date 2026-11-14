import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Rocket, Save } from 'lucide-react';
import {
  DEFAULT_ROOM_SETTINGS,
  RoomInput,
  SCORING_PRESETS,
  ScoringConfig,
  type ConfirmResult,
  type RoomDetailDto,
  type RoomSettings,
} from '@sq/shared';
import { ease, spring } from '@/design/motion';
import { errorText } from '@/lib/api';
import { cn } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/dom';
import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/display';
import { ConfirmDialog } from '@/ui/Dialog';
import { useConfirmRoom, useRoom, useSaveRoom } from '../api';
import { KindBadge, Medal, PageHeader, SectionCard } from '../components/common';
import { ConfirmSuccessModal } from './JoinInfo';
import { QuestionPickerStep, itemKey, type SelectedItem } from './QuestionPickerStep';
import { PointsChart, SettingsStep } from './SettingsStep';

const STEPS = [
  { n: 1, label: '설정' },
  { n: 2, label: '문제 선택' },
  { n: 3, label: '검토·확정' },
] as const;

interface WizardState {
  title: string;
  settings: RoomSettings;
  items: SelectedItem[];
}

function fromRoom(r: RoomDetailDto): WizardState {
  return {
    title: r.title,
    settings: r.settings,
    items: r.items.map((it) => ({ key: itemKey(), questionId: it.questionId, timeLimitSec: it.timeLimitSec, multiplier: it.multiplier, question: it.question })),
  };
}

function toInput(s: WizardState) {
  return {
    title: s.title,
    settings: s.settings,
    items: s.items.map((i) => ({ questionId: i.questionId, timeLimitSec: i.timeLimitSec, multiplier: i.multiplier })),
  };
}

const fp = (s: WizardState) => JSON.stringify(toInput(s));

function Stepper({ step, onStep }: { step: number; onStep: (n: number) => void }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="진행 단계">
      {STEPS.map((s, i) => {
        const done = step > s.n;
        const active = step === s.n;
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => onStep(s.n)}
              aria-current={active ? 'step' : undefined}
              className="flex min-h-12 min-w-0 items-center gap-2 rounded-md pr-2 text-left"
            >
              <span
                className={cn(
                  'relative flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-black transition-colors',
                  active ? 'bg-spark-400 text-ink' : done ? 'bg-ink text-white' : 'bg-n-200 text-n-500',
                )}
              >
                {done ? <Check className="size-5" strokeWidth={3} /> : s.n}
                {active && (
                  <m.span layoutId="step-ring" className="absolute -inset-1 rounded-full ring-2 ring-spark-500" transition={spring.snappy} />
                )}
              </span>
              <span className={cn('truncate text-sm font-bold', active ? 'text-fg' : 'text-fg-muted', !active && 'hidden sm:inline')}>{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-n-200">
                <m.span
                  className="block h-full origin-left bg-ink"
                  initial={false}
                  animate={{ scaleX: done ? 1 : 0 }}
                  transition={{ duration: 0.35, ease: ease.standard }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ReviewStep({ state, onStep }: { state: WizardState; onStep: (n: number) => void }) {
  const s = state.settings;
  const deleted = state.items.filter((i) => !i.question).length;
  const preset = SCORING_PRESETS[s.scoring.mode];
  return (
    <div className="flex flex-col gap-6">
      {(state.items.length === 0 || deleted > 0 || !state.title.trim()) && (
        <div className="flex flex-col gap-2 rounded-md bg-warning-tint p-4 font-semibold text-warning-text">
          {!state.title.trim() && (
            <p className="flex items-center gap-2">
              <AlertTriangle className="size-5 shrink-0" /> 퀴즈방 이름을 입력해 주세요.
            </p>
          )}
          {state.items.length === 0 && (
            <p className="flex items-center gap-2">
              <AlertTriangle className="size-5 shrink-0" /> 문제를 한 개 이상 선택해 주세요.
            </p>
          )}
          {deleted > 0 && (
            <p className="flex items-center gap-2">
              <AlertTriangle className="size-5 shrink-0" /> 삭제된 문제 {deleted}개를 목록에서 빼야 확정할 수 있어요.
            </p>
          )}
        </div>
      )}
      <SectionCard
        title={state.title || '(이름 없음)'}
        actions={
          <Button size="sm" variant="ghost" onClick={() => onStep(1)}>
            설정 수정
          </Button>
        }
      >
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['기본 제한시간', `${s.defaultTimeLimitSec}초`],
            ['준비 시간', `${s.readyCountdownSec}초`],
            ['점수 방식', preset.label],
            ['시상 인원', s.prizeCount ? `${s.prizeCount}명` : '시상 없음'],
            ['모두 응답 시 자동 마감', s.autoCloseWhenAllAnswered ? '켜짐' : '꺼짐'],
            ['문제마다 순위', s.showLeaderboardAfterEach ? '보여줘요' : '건너뛰어요'],
            ['휴대폰 문제 표시', s.showQuestionOnDevices ? '보여줘요' : '보기 버튼만'],
            ['중간 입장', s.allowLateJoin ? '허용' : '허용 안 함'],
            ['최대 인원', `${s.maxParticipants}명`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line/60 pb-2">
              <dt className="text-fg-muted">{k}</dt>
              <dd className="font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto]">
          <PointsChart cfg={s.scoring} />
          {s.prizeCount > 0 && (
            <div className="flex flex-wrap content-center items-center gap-1.5 rounded-md bg-n-50 p-4">
              {Array.from({ length: s.prizeCount }, (_, i) => (
                <Medal key={i} rank={i + 1} />
              ))}
            </div>
          )}
        </div>
      </SectionCard>
      <SectionCard
        title={`문제 ${state.items.length}개`}
        actions={
          <Button size="sm" variant="ghost" onClick={() => onStep(2)}>
            문제 수정
          </Button>
        }
      >
        <ol className="flex flex-col gap-2">
          {state.items.map((it, i) => (
            <li key={it.key} className={cn('flex items-center gap-3 rounded-md p-3', it.question ? 'bg-n-25' : 'bg-danger-tint')}>
              <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-white">{i + 1}</span>
              {it.question ? (
                <>
                  <KindBadge kind={it.question.kind} />
                  <span className="min-w-0 flex-1 truncate font-bold">{it.question.title || it.question.preview}</span>
                  <span className="tabular shrink-0 text-xs font-semibold text-fg-muted">
                    {it.timeLimitSec ?? it.question.timeLimitSec ?? s.defaultTimeLimitSec}초{it.multiplier !== 1 && ` · ×${it.multiplier}`}
                  </span>
                </>
              ) : (
                <span className="font-bold text-danger-text">삭제된 문제</span>
              )}
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  );
}

export default function RoomWizardPage() {
  const params = useParams();
  const roomId = params.id ? Number(params.id) : null;
  const isNew = roomId === null;
  useDocumentTitle(isNew ? '새 퀴즈방' : '퀴즈방 수정');
  const [search, setSearch] = useSearchParams();
  const step = Math.min(3, Math.max(1, Number(search.get('step')) || 1));
  const navigate = useNavigate();
  const room = useRoom(roomId);
  const save = useSaveRoom();
  const confirm = useConfirmRoom();

  const [state, setState] = useState<WizardState>(() => ({ title: '', settings: DEFAULT_ROOM_SETTINGS, items: [] }));
  const [initial, setInitial] = useState(() => fp(state));
  const [loaded, setLoaded] = useState(isNew);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [confirmAsk, setConfirmAsk] = useState(false);
  const [success, setSuccess] = useState<(ConfirmResult & { roomId: number }) | null>(null);
  const [dir, setDir] = useState(1);
  const allowLeave = useRef(false);

  useEffect(() => {
    if (!loaded && room.data && room.data.phase === 'DRAFT') {
      const s = fromRoom(room.data);
      setState(s);
      setInitial(fp(s));
      setLoaded(true);
    }
  }, [room.data, loaded]);

  const dirty = fp(state) !== initial;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !allowLeave.current && currentLocation.pathname !== nextLocation.pathname);

  const goStep = (n: number) => {
    if (n === step) return;
    if (n > 1 && !state.title.trim()) {
      setTitleError('퀴즈방 이름을 입력해 주세요.');
      toast.error('퀴즈방 이름을 먼저 입력해 주세요.');
      if (step !== 1) setSearch({ step: '1' }, { replace: true });
      return;
    }
    if (n > 1 && !ScoringConfig.safeParse(state.settings.scoring).success) {
      toast.error('점수 설정을 확인해 주세요.');
      return;
    }
    setDir(n > step ? 1 : -1);
    setSearch({ step: String(n) }, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Save the draft; returns the room id. */
  const persist = async (moveToEditUrl = true): Promise<number | null> => {
    const parsed = RoomInput.safeParse(toInput(state));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === 'title') {
        setTitleError(issue.message);
        goStep(1);
      }
      toast.error(issue?.message ?? '입력값을 확인해 주세요.');
      return null;
    }
    try {
      const r = await save.mutateAsync({ id: roomId, input: parsed.data });
      setInitial(fp(state));
      if (isNew && moveToEditUrl) {
        allowLeave.current = true;
        navigate(`/admin/rooms/${r.id}/edit?step=${step}`, { replace: true });
        allowLeave.current = false;
      }
      return r.id;
    } catch (err) {
      toast.error(errorText(err));
      return null;
    }
  };

  const doConfirm = async () => {
    // stay mounted (no URL change) so the success modal can show
    const id = await persist(false);
    if (id === null) return;
    try {
      const r = await confirm.mutateAsync(id);
      allowLeave.current = true;
      setSuccess({ ...r, roomId: id });
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  if (!isNew) {
    if (room.isPending)
      return (
        <div className="flex justify-center py-24 text-n-400">
          <Spinner className="size-8" />
        </div>
      );
    if (room.isError) return <Navigate to="/admin/rooms" replace />;
    if (room.data.phase !== 'DRAFT' && !success) return <Navigate to={`/admin/rooms/${roomId}`} replace />;
  }

  const canConfirm = state.items.length > 0 && state.items.every((i) => i.question) && state.title.trim().length > 0;

  return (
    <>
      <PageHeader
        back={
          <Link to="/admin/rooms" className="inline-flex items-center gap-1 text-sm font-bold text-fg-muted hover:text-fg">
            <ArrowLeft className="size-4" /> 퀴즈방 목록
          </Link>
        }
        title={isNew ? '새 퀴즈방 만들기' : '퀴즈방 수정'}
        description={dirty ? '저장하지 않은 변경 사항이 있어요.' : !isNew ? '임시 저장된 상태예요.' : undefined}
        actions={
          <Button variant="secondary" icon={<Save className="size-4" />} loading={save.isPending && !confirm.isPending} onClick={() => void persist().then((id) => id && toast.success('임시 저장했어요.'))}>
            임시 저장
          </Button>
        }
      />
      <Stepper step={step} onStep={goStep} />

      <div className="relative">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <m.div
            key={step}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 32 }),
              center: { opacity: 1, x: 0, transition: spring.gentle },
              exit: (d: number) => ({ opacity: 0, x: d * -24, transition: { duration: 0.15, ease: ease.exit } }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {step === 1 && (
              <SettingsStep
                title={state.title}
                onTitle={(title) => {
                  setState((s) => ({ ...s, title }));
                  if (titleError) setTitleError(null);
                }}
                settings={state.settings}
                onSettings={(settings) => setState((s) => ({ ...s, settings }))}
                titleError={titleError}
              />
            )}
            {step === 2 && <QuestionPickerStep items={state.items} onItems={(items) => setState((s) => ({ ...s, items }))} />}
            {step === 3 && <ReviewStep state={state} onStep={goStep} />}
          </m.div>
        </AnimatePresence>
      </div>

      <div className="sticky bottom-20 z-10 mt-8 flex items-center justify-between gap-3 rounded-lg bg-surface/95 p-3 shadow-lg ring-1 ring-line backdrop-blur md:bottom-4">
        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} disabled={step === 1} onClick={() => goStep(step - 1)}>
          이전
        </Button>
        <span className="tabular hidden text-sm font-bold text-fg-muted sm:inline">
          {step} / 3 · 문제 {state.items.length}개
        </span>
        {step < 3 ? (
          <Button variant="ink" onClick={() => goStep(step + 1)}>
            다음 <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button icon={<Rocket className="size-5" />} disabled={!canConfirm} loading={confirm.isPending} onClick={() => setConfirmAsk(true)}>
            확정하고 열기
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmAsk}
        onOpenChange={setConfirmAsk}
        title="퀴즈방을 확정할까요?"
        description="확정하면 참여자가 들어올 수 있고, 설정과 문제는 더 이상 바꿀 수 없어요. (대기실 단계에서는 확정을 취소할 수 있어요)"
        confirmLabel="확정하고 열기"
        onConfirm={doConfirm}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(v) => !v && blocker.state === 'blocked' && blocker.reset()}
        title="저장하지 않고 나갈까요?"
        description="변경한 설정과 문제 선택이 사라져요."
        confirmLabel="나가기"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
      />
      {success && (
        <ConfirmSuccessModal
          open
          onOpenChange={(v) => {
            if (!v) navigate(`/admin/rooms/${success.roomId}`);
          }}
          roomId={success.roomId}
          code={success.code}
          joinUrl={success.joinUrl}
          presenterUrl={success.presenterUrl}
        />
      )}
    </>
  );
}
