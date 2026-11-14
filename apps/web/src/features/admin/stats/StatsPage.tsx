import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Info, Trophy, LibraryBig, Users, UsersRound, Flag } from 'lucide-react';
import { STATS_RANGES, type AdminUsageRow, type StatsRange } from '@sq/shared';
import { errorText } from '@/lib/api';
import { cn, dateTime } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/dom';
import { Avatar, Badge, EmptyState, Spinner } from '@/ui/display';
import { Segmented } from '@/ui/fields';
import { useAdminStats } from '../api';
import { PageHeader, SectionCard } from '../components/common';
import { DailyChart, Swatch } from './DailyChart';
import { SERIES, shortDate } from './viz';

const num = (n: number) => n.toLocaleString('ko-KR');

function Kpi({ icon, label, value, sub }: { icon: ReactNode; label: string; value: number; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface p-4 shadow-sm ring-1 ring-line/60">
      <span className="flex items-center gap-1.5 text-sm font-bold text-fg-muted">
        {icon}
        {label}
      </span>
      <span className="tabular text-3xl leading-tight font-black">{num(value)}</span>
      {sub && <span className="text-xs font-semibold text-fg-muted">{sub}</span>}
    </div>
  );
}

/** Two thin bars per admin on one shared count scale; values printed at the tips. */
function AdminBars({ rows }: { rows: AdminUsageRow[] }) {
  const top = [...rows].sort((a, b) => b.questions + b.rooms - (a.questions + a.rooms) || a.id - b.id).slice(0, 10);
  const max = Math.max(1, ...top.flatMap((r) => [r.questions, r.rooms]));
  if (!top.some((r) => r.questions + r.rooms > 0)) {
    return <p className="py-6 text-center text-sm font-semibold text-fg-muted">아직 만든 문제나 퀴즈방이 없어요.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {top.map((r) => (
        <li key={r.id} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar id={r.id} name={r.displayName} size={28} />
            <span className="truncate text-sm font-bold" title={`${r.displayName} (${r.username})`}>
              {r.displayName}
            </span>
          </span>
          <span className="flex min-w-0 flex-col gap-[2px]">
            {(['questions', 'rooms'] as const).map((k) => (
              <span key={k} className="flex items-center gap-2" title={`${r.displayName} · ${SERIES[k].label} ${r[k]}개`}>
                <span
                  className="h-2.5 rounded-r-[4px]"
                  style={{ width: `calc(${(r[k] / max) * 100}% - 2.5rem)`, minWidth: r[k] ? 3 : 0, background: SERIES[k].color }}
                />
                <span className="tabular shrink-0 text-xs font-bold text-fg-muted">{r[k]}</span>
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

type SortKey = 'displayName' | 'questions' | 'rooms' | 'gamesFinished' | 'participants' | 'createdAt' | 'lastLoginAt';
const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'displayName', label: '관리자' },
  { key: 'questions', label: '문제 (공개)', numeric: true },
  { key: 'rooms', label: '퀴즈방', numeric: true },
  { key: 'gamesFinished', label: '종료 게임', numeric: true },
  { key: 'participants', label: '누적 참가자', numeric: true },
  { key: 'createdAt', label: '가입일', numeric: true },
  { key: 'lastLoginAt', label: '마지막 로그인', numeric: true },
];

function AdminTable({ rows }: { rows: AdminUsageRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'questions', desc: true });
  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      const c = typeof av === 'string' ? av.localeCompare(bv as string, 'ko') : (av as number) - (bv as number);
      return (sort.desc ? -c : c) || a.id - b.id;
    });
    return out;
  }, [rows, sort]);
  return (
    <div className="-mx-5 overflow-x-auto px-5 md:-mx-6 md:px-6">
      <table className="w-full min-w-[44rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-muted">
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} scope="col" aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'} className={cn('py-2 pr-3 font-bold', c.numeric && 'text-right')}>
                  <button
                    type="button"
                    className={cn('inline-flex items-center gap-1 hover:text-fg', active && 'text-fg')}
                    onClick={() => setSort({ key: c.key, desc: active ? !sort.desc : c.key !== 'displayName' })}
                  >
                    {c.label}
                    {active && (sort.desc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((r) => (
            <tr key={r.id} className={cn(r.disabled && 'opacity-60')}>
              <td className="py-2.5 pr-3">
                <span className="flex items-center gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{r.displayName}</span>
                    <span className="block truncate text-xs text-fg-muted">{r.username}</span>
                  </span>
                  {r.role === 'MAIN' && <Badge tone="ink">메인</Badge>}
                  {r.disabled && <Badge tone="neutral">비활성</Badge>}
                </span>
              </td>
              <td className="tabular py-2.5 pr-3 text-right font-bold">
                {num(r.questions)} <span className="font-semibold text-fg-muted">({num(r.publicQuestions)})</span>
              </td>
              <td className="tabular py-2.5 pr-3 text-right font-bold">{num(r.rooms)}</td>
              <td className="tabular py-2.5 pr-3 text-right">{num(r.gamesFinished)}</td>
              <td className="tabular py-2.5 pr-3 text-right">{num(r.participants)}</td>
              <td className="tabular py-2.5 pr-3 text-right text-fg-muted">{dateTime(r.createdAt)}</td>
              <td className="tabular py-2.5 text-right text-fg-muted">{r.lastLoginAt ? dateTime(r.lastLoginAt) : '없음'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Main-admin usage overview: counts and trends only, never question or room content. */
export default function StatsPage() {
  useDocumentTitle('이용 현황');
  const [days, setDays] = useState<StatsRange>(30);
  const stats = useAdminStats(days);
  const s = stats.data;
  const period = s
    ? {
        questions: s.daily.reduce((a, d) => a + d.questions, 0),
        rooms: s.daily.reduce((a, d) => a + d.rooms, 0),
        games: s.daily.reduce((a, d) => a + d.games, 0),
      }
    : null;

  return (
    <>
      <PageHeader
        title="이용 현황"
        description="관리자별로 문제와 퀴즈방을 얼마나 만들었는지 숫자로만 보여줘요. 문제·퀴즈방 내용은 이 화면에서 볼 수 없어요."
      />

      {stats.isPending ? (
        <div className="flex justify-center py-24 text-n-400">
          <Spinner className="size-8" />
        </div>
      ) : stats.isError || !s || !period ? (
        <EmptyState title="현황을 불러오지 못했어요">{errorText(stats.error)}</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
            <Kpi icon={<UsersRound className="size-4" />} label="관리자" value={s.totals.admins} sub={`활성 ${num(s.totals.activeAdmins)} · 메인 ${num(s.totals.mainAdmins)}`} />
            <Kpi icon={<LibraryBig className="size-4" />} label="문제" value={s.totals.questions} sub={`공개 ${num(s.totals.publicQuestions)}`} />
            <Kpi
              icon={<Trophy className="size-4" />}
              label="퀴즈방"
              value={s.totals.rooms}
              sub={`작성 ${num(s.totals.roomsDraft)} · 대기 ${num(s.totals.roomsReady)} · 진행 ${num(s.totals.roomsLive)} · 종료 ${num(s.totals.roomsEnded)}`}
            />
            <Kpi icon={<Flag className="size-4" />} label="종료된 게임" value={s.totals.gamesFinished} />
            <Kpi icon={<Users className="size-4" />} label="누적 참가자" value={s.totals.participants} />
          </div>

          <SectionCard
            title="일별 생성 현황"
            description={`${shortDate(s.daily[0]!.date)} ~ ${shortDate(s.daily.at(-1)!.date)} · 날짜를 가리키면 자세한 숫자가 보여요.`}
            actions={
              <Segmented
                label="기간"
                className="shrink-0 [&_button]:whitespace-nowrap"
                value={String(days)}
                onChange={(v) => setDays(Number(v) as StatsRange)}
                options={STATS_RANGES.map((d) => ({ value: String(d), label: `${d}일` }))}
              />
            }
          >
            <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="범례">
              {(['questions', 'rooms', 'games'] as const).map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <Swatch kind={k} />
                  <span className="text-fg-muted">{SERIES[k].label}</span>
                  <span className="tabular font-bold">{num(period[k])}</span>
                </li>
              ))}
            </ul>
            <DailyChart daily={s.daily} />
            <details className="mt-4 rounded-md ring-1 ring-line">
              <summary className="cursor-pointer px-3 py-2 text-sm font-bold">일별 표로 보기</summary>
              <div className="max-h-72 overflow-y-auto border-t border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface text-xs text-fg-muted">
                    <tr>
                      <th scope="col" className="px-3 py-1.5 text-left">날짜</th>
                      <th scope="col" className="px-3 py-1.5 text-right">문제</th>
                      <th scope="col" className="px-3 py-1.5 text-right">퀴즈방</th>
                      <th scope="col" className="px-3 py-1.5 text-right">종료 게임</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...s.daily].reverse().map((d) => (
                      <tr key={d.date}>
                        <td className="px-3 py-1.5">{shortDate(d.date, true)}</td>
                        <td className="tabular px-3 py-1.5 text-right">{d.questions}</td>
                        <td className="tabular px-3 py-1.5 text-right">{d.rooms}</td>
                        <td className="tabular px-3 py-1.5 text-right">{d.games}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </SectionCard>

          <SectionCard title="관리자별 문제·퀴즈방" description="지금 남아 있는 문제(삭제 제외)와 퀴즈방 수예요. 많이 만든 순서로 10명까지 보여줘요.">
            <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="범례">
              {(['questions', 'rooms'] as const).map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <Swatch kind={k} />
                  <span className="text-fg-muted">{SERIES[k].label}</span>
                </li>
              ))}
            </ul>
            <AdminBars rows={s.perAdmin} />
          </SectionCard>

          <SectionCard title="관리자 전체 목록" description="열 제목을 누르면 정렬돼요.">
            <AdminTable rows={s.perAdmin} />
          </SectionCard>

          <p className="flex items-start gap-2 text-xs text-fg-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            일별 문제 수에는 나중에 삭제된 문제도 포함돼요. 퀴즈방은 삭제하면 기록이 남지 않아 집계에서 빠져요. 날짜는 이 기기의 시간대 기준이에요.
          </p>
        </div>
      )}
    </>
  );
}
