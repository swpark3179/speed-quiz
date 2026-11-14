import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AdminStatsDto } from '@sq/shared';
import { cn } from '@/lib/format';
import { SERIES, niceMax, shortDate } from './viz';

type Day = AdminStatsDto['daily'][number];

const H = 240;
const M = { top: 14, right: 10, bottom: 26, left: 34 };

/** Rounded data-end (4px) on top, square at the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Daily activity: questions & rooms created as grouped columns, finished games as a line, all on one
 * count axis. Hover/focus a day for its exact numbers.
 */
export function DailyChart({ daily }: { daily: Day[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = daily.length;
  const innerW = width - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const max = niceMax(Math.max(0, ...daily.flatMap((d) => [d.questions, d.rooms, d.games])));
  const y = (v: number) => M.top + innerH - (v / max) * innerH;
  const band = innerW / Math.max(1, n);
  const barW = Math.max(1.5, Math.min(12, (band - 4) / 2 - 1));
  const cx = (i: number) => M.left + band * i + band / 2;
  const ticks = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t)).filter((v, i, a) => a.indexOf(v) === i), [max]);
  const labelEvery = Math.max(1, Math.ceil(52 / band));
  const showDots = band >= 12;
  const linePts = daily.map((d, i) => `${cx(i)},${y(d.games)}`).join(' ');

  const hd = hover !== null ? daily[hover] : null;
  // Tooltip sits beside the hovered day (never on top of its marks): right of it, or left near the edge.
  const TIP_W = 160;
  const tipLeft =
    hover === null ? 0 : cx(hover) + band / 2 + 8 + TIP_W <= width ? cx(hover) + band / 2 + 8 : Math.max(0, cx(hover) - band / 2 - 8 - TIP_W);

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`최근 ${n}일 일별 생성 현황. 문제 ${sum(daily, 'questions')}개, 퀴즈방 ${sum(daily, 'rooms')}개, 종료된 게임 ${sum(daily, 'games')}회.`}
        className="block overflow-visible"
        onPointerLeave={() => setHover(null)}
      >
        {/* recessive grid + y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-muted text-[11px] tabular">
              {t}
            </text>
          </g>
        ))}

        {hover !== null && <rect x={M.left + band * hover} y={M.top} width={band} height={innerH} fill="var(--color-n-100)" />}

        {/* columns: 2px surface gap between the pair */}
        {daily.map((d, i) => {
          const x0 = cx(i) - barW - 1;
          return (
            <g key={d.date}>
              <path d={columnPath(x0, y(d.questions), barW, innerH + M.top - y(d.questions))} fill={SERIES.questions.color} />
              <path d={columnPath(x0 + barW + 2, y(d.rooms), barW, innerH + M.top - y(d.rooms))} fill={SERIES.rooms.color} />
            </g>
          );
        })}

        {/* games line + ringed markers */}
        <polyline points={linePts} fill="none" stroke={SERIES.games.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {daily.map((d, i) =>
          showDots || hover === i ? (
            <circle key={d.date} cx={cx(i)} cy={y(d.games)} r={4} fill={SERIES.games.color} stroke="var(--surface)" strokeWidth={2} />
          ) : null,
        )}

        {/* x labels */}
        {daily.map((d, i) =>
          (n - 1 - i) % labelEvery === 0 ? (
            <text key={d.date} x={cx(i)} y={H - 8} textAnchor="middle" className="fill-fg-muted text-[11px] tabular">
              {shortDate(d.date)}
            </text>
          ) : null,
        )}

        {/* hit targets: the whole day band, larger than any mark */}
        {daily.map((d, i) => (
          <rect
            key={d.date}
            x={M.left + band * i}
            y={M.top}
            width={band}
            height={innerH}
            fill="transparent"
            tabIndex={0}
            aria-label={`${shortDate(d.date)}: 문제 ${d.questions}, 퀴즈방 ${d.rooms}, 종료 게임 ${d.games}`}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="outline-none"
          />
        ))}
      </svg>

      {hd && (
        <div
          role="status"
          className={cn(
            'pointer-events-none absolute top-0 z-10 w-40 rounded-md bg-surface px-3 py-2 text-sm shadow-lg ring-1 ring-line',
          )}
          style={{ left: tipLeft }}
        >
          <p className="mb-1 font-bold">{shortDate(hd.date, true)}</p>
          {(['questions', 'rooms', 'games'] as const).map((k) => (
            <p key={k} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-fg-muted">
                <Swatch kind={k} />
                {SERIES[k].label}
              </span>
              <span className="tabular font-bold">{hd[k]}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function Swatch({ kind }: { kind: keyof typeof SERIES }) {
  return kind === 'games' ? (
    <span className="relative inline-block h-2.5 w-4" aria-hidden="true">
      <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full" style={{ background: SERIES.games.color }} />
      <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: SERIES.games.color }} />
    </span>
  ) : (
    <span className="inline-block size-2.5 rounded-[3px]" style={{ background: SERIES[kind].color }} aria-hidden="true" />
  );
}

function sum(days: Day[], k: 'questions' | 'rooms' | 'games'): number {
  return days.reduce((a, d) => a + d[k], 0);
}
