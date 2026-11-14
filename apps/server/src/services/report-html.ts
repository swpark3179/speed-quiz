/**
 * Self-contained HTML report for a finished quiz (admin download).
 * Everything user-supplied (nicknames, titles, questions, choices) goes through `esc()`;
 * the page has no scripts and no external resources so it opens offline and prints cleanly.
 */

export interface ReportData {
  room: { title: string; startedAt: number | null; finishedAt: number | null; prizeCount: number };
  generatedAt: number;
  participantCount: number;
  questionCount: number;
  /** correct answers / (participants × closed questions), 0..1 */
  avgCorrectRate: number;
  /** mean elapsed time of correct answers in ms */
  avgCorrectMs: number | null;
  ranking: {
    rank: number;
    nickname: string;
    score: number;
    correctCount: number;
    avgCorrectMs: number | null;
    isWinner: boolean;
  }[];
  questions: {
    index: number;
    title: string;
    text: string;
    kind: 'TEXT' | 'HTML';
    participantCount: number;
    answeredCount: number;
    correctCount: number;
    avgElapsedMs: number | null;
    fastest: { nickname: string; elapsedMs: number } | null;
    choices: { position: number; text: string; isCorrect: boolean; count: number }[];
  }[];
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]!);
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const sec = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)}초`);
const num = (n: number) => n.toLocaleString('ko-KR');

function dateText(ms: number | null): string {
  if (!ms) return '–';
  return new Date(ms).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function durationText(a: number | null, b: number | null): string {
  if (!a || !b || b < a) return '–';
  const total = Math.round((b - a) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}시간 ${m}분` : m ? `${m}분 ${s}초` : `${s}초`;
}

/** Donut gauge, r=26 → circumference ≈ 163.4 */
function ring(percent: number, tone: string): string {
  const C = 2 * Math.PI * 26;
  const dash = (Math.max(0, Math.min(100, percent)) / 100) * C;
  return `<svg class="ring" viewBox="0 0 64 64" role="img" aria-label="정답률 ${percent}%">
    <circle cx="32" cy="32" r="26" fill="none" stroke="var(--n-100)" stroke-width="9"/>
    <circle cx="32" cy="32" r="26" fill="none" stroke="${tone}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/>
    <text x="32" y="37" text-anchor="middle" class="ring-t">${percent}%</text>
  </svg>`;
}

function rateTone(p: number): string {
  return p >= 70 ? 'var(--success)' : p >= 40 ? 'var(--spark-500)' : 'var(--danger)';
}

/** Score histogram (up to 8 bins) as inline SVG. */
function histogram(scores: number[]): string {
  if (scores.length === 0) return '';
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const bins = Math.min(8, Math.max(1, new Set(scores).size));
  const span = Math.max(1, max - min + 1);
  const size = Math.ceil(span / bins);
  const counts = Array.from({ length: bins }, () => 0);
  for (const s of scores) counts[Math.min(bins - 1, Math.floor((s - min) / size))]!++;
  const top = Math.max(...counts);
  const W = 560;
  const H = 150;
  const gap = 10;
  const bw = (W - gap * (bins - 1)) / bins;
  const bars = counts
    .map((c, i) => {
      const h = top ? Math.max(c ? 6 : 0, (c / top) * (H - 46)) : 0;
      const x = i * (bw + gap);
      const lo = min + i * size;
      const hi = i === bins - 1 ? max : lo + size - 1;
      const label = lo === hi ? num(lo) : `${num(lo)}–${num(hi)}`;
      return `<g>
        <rect x="${x.toFixed(1)}" y="${(H - 24 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="var(--spark-400)"/>
        <text x="${(x + bw / 2).toFixed(1)}" y="${(H - 28 - h).toFixed(1)}" text-anchor="middle" class="h-n">${c ? `${c}명` : ''}</text>
        <text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="h-l">${esc(label)}</text>
      </g>`;
    })
    .join('');
  return `<svg class="hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="점수 분포">${bars}</svg>`;
}

const CSS = `
:root{--ink:#17153b;--n-25:#fbfaff;--n-50:#f5f4fa;--n-100:#eceaf4;--n-200:#dad7e8;--n-400:#8a85a8;--n-500:#6b6690;--n-600:#4f4b70;
--spark-100:#ffedb8;--spark-400:#ffc233;--spark-500:#f5a800;--spark-700:#8a5a00;--success:#12813f;--success-tint:#e8f8ee;--danger:#d12b2b;--info:#1f5fe0;
--silver:#aeb4c4;--bronze:#d08a52}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--n-50);color:var(--ink);font:16px/1.55 "Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",system-ui,-apple-system,"Segoe UI",sans-serif;
-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{max-width:980px;margin:0 auto;padding:0 20px 56px}
header.hero{background:var(--ink);color:#fff;padding:44px 0 72px;position:relative;overflow:hidden}
header.hero::before{content:"";position:absolute;right:-60px;top:-80px;width:280px;height:280px;border-radius:50%;background:var(--spark-400);opacity:.95}
header.hero::after{content:"";position:absolute;right:150px;top:70px;width:90px;height:90px;border-radius:22px;background:var(--spark-500);transform:rotate(18deg);opacity:.55}
.hero .wrap{position:relative;z-index:1;padding-bottom:0}
.eyebrow{display:inline-block;background:var(--spark-400);color:var(--ink);font-weight:900;font-size:12px;letter-spacing:.14em;padding:5px 12px;border-radius:999px}
h1{margin:14px 0 10px;font-size:clamp(26px,5vw,40px);line-height:1.2;font-weight:900;letter-spacing:-.02em;max-width:640px;overflow-wrap:anywhere}
.meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:#cfcdea;font-weight:600;font-size:14px}
.meta b{color:#fff}
main{margin-top:-44px;position:relative;z-index:2}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.kpi{background:#fff;border-radius:18px;padding:18px 18px 16px;box-shadow:0 2px 0 var(--n-100),0 10px 30px -18px rgba(23,21,59,.35)}
.kpi span{display:block;font-size:13px;font-weight:800;color:var(--n-500)}
.kpi strong{display:block;font-size:30px;font-weight:900;letter-spacing:-.02em;margin-top:2px;font-variant-numeric:tabular-nums}
.kpi small{font-size:14px;font-weight:700;color:var(--n-500);margin-left:2px}
section{margin-top:34px}
h2{font-size:21px;font-weight:900;margin:0 0 14px;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}
h2::before{content:"";width:6px;height:22px;border-radius:3px;background:var(--spark-400)}
.card{background:#fff;border-radius:18px;padding:20px;box-shadow:0 2px 0 var(--n-100);break-inside:avoid}
.podium{display:grid;grid-template-columns:1fr 1.15fr 1fr;gap:14px;align-items:end}
.pod{background:#fff;border-radius:18px;text-align:center;padding:18px 12px;box-shadow:0 2px 0 var(--n-100);position:relative}
.pod .medal{width:46px;height:46px;border-radius:50%;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;color:#fff}
.pod .nm{font-weight:900;font-size:18px;overflow-wrap:anywhere}
.pod .sc{font-size:26px;font-weight:900;font-variant-numeric:tabular-nums;margin-top:2px}
.pod .sub{color:var(--n-500);font-weight:700;font-size:13px}
.pod.p1{padding-top:30px;padding-bottom:30px;background:linear-gradient(180deg,var(--spark-100),#fff 70%);box-shadow:0 0 0 3px var(--spark-400)}
.pod.p1 .medal{background:var(--spark-500);width:56px;height:56px;font-size:24px}
.pod.p2 .medal{background:var(--silver)}.pod.p3 .medal{background:var(--bronze)}
.pod.p2{padding-top:24px;padding-bottom:24px}
.winners{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;gap:6px;align-items:center;background:var(--n-50);border-radius:999px;padding:5px 12px;font-weight:800;font-size:14px}
.chip i{font-style:normal;background:var(--ink);color:var(--spark-400);border-radius:999px;font-size:12px;padding:1px 8px}
.insights{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.ins{background:#fff;border-radius:18px;padding:18px;box-shadow:0 2px 0 var(--n-100);break-inside:avoid}
.ins .k{font-size:13px;font-weight:800;color:var(--n-500)}
.ins .v{font-size:22px;font-weight:900;margin:2px 0;letter-spacing:-.01em;overflow-wrap:anywhere}
.ins .d{font-size:14px;color:var(--n-600);font-weight:600;overflow-wrap:anywhere}
.hist{width:100%;height:auto;display:block}
.h-n{font-size:12px;font-weight:800;fill:var(--ink)}.h-l{font-size:11px;font-weight:700;fill:var(--n-500)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{font-size:12px;color:var(--n-500);text-align:left;padding:0 10px 10px;font-weight:800}
td{padding:11px 10px;border-top:1px solid var(--n-100);font-weight:700;vertical-align:middle}
td.r{width:56px;font-weight:900}.num{text-align:right}th.num{text-align:right}
tr.win td{background:#fffaf0}
.nick{overflow-wrap:anywhere}
.bar{height:10px;background:var(--n-100);border-radius:999px;overflow:hidden;min-width:90px}
.bar>b{display:block;height:100%;background:var(--spark-400);border-radius:999px}
.rk{display:inline-flex;width:30px;height:30px;border-radius:50%;align-items:center;justify-content:center;background:var(--n-100);font-weight:900;font-size:14px}
.rk.t1{background:var(--spark-500);color:#fff}.rk.t2{background:var(--silver);color:#fff}.rk.t3{background:var(--bronze);color:#fff}
.win-b{display:inline-block;background:var(--ink);color:var(--spark-400);border-radius:999px;font-size:11px;padding:1px 8px;margin-left:6px;font-weight:900;white-space:nowrap}
.q{display:grid;grid-template-columns:72px 1fr;gap:16px;margin-bottom:14px}
.q .no{font-weight:900;font-size:13px;color:var(--n-500);margin-bottom:2px}
.q h3{margin:0 0 4px;font-size:17px;line-height:1.4;overflow-wrap:anywhere}
.q p.t{margin:0 0 10px;color:var(--n-600);font-weight:600;font-size:14.5px;overflow-wrap:anywhere}
.ring{width:72px;height:72px}.ring-t{font-size:15px;font-weight:900;fill:var(--ink)}
.stats{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;font-weight:700;color:var(--n-500);margin-bottom:12px}
.stats b{color:var(--ink)}
.ch{display:grid;grid-template-columns:28px 1fr 74px;gap:10px;align-items:center;margin-top:7px;font-weight:700;font-size:14.5px}
.ch .l{width:28px;height:28px;border-radius:8px;background:var(--n-100);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px}
.ch.ok .l{background:var(--success);color:#fff}
.ch .tx{min-width:0}.ch .tx>span{display:block;overflow-wrap:anywhere}
.ch .meter{height:8px;background:var(--n-100);border-radius:999px;margin-top:4px;overflow:hidden}
.ch .meter>b{display:block;height:100%;background:var(--n-400);border-radius:999px}
.ch.ok .meter>b{background:var(--success)}
.ch .n{text-align:right;color:var(--n-500);font-variant-numeric:tabular-nums;font-size:13px}
.ch.ok .tx>span{color:var(--success)}
.empty{color:var(--n-500);font-weight:700;text-align:center;padding:26px 0}
footer{margin-top:40px;text-align:center;color:var(--n-500);font-size:13px;font-weight:600}
@media(max-width:720px){header.hero::before{width:150px;height:150px;right:-50px;top:-60px}header.hero::after{display:none}.grid4{grid-template-columns:repeat(2,1fr)}.insights{grid-template-columns:1fr}.podium{grid-template-columns:1fr}
.pod.p1,.pod.p2,.pod{padding-top:18px;padding-bottom:18px}.q{grid-template-columns:1fr}.q .ring{width:60px;height:60px}
.hide-s{display:none}.card{padding:16px}th,td{padding-left:6px;padding-right:6px}}
@media print{body{background:#fff}.wrap{max-width:none;padding:0}header.hero{padding:26px 0 56px}main{margin-top:-36px}
section{margin-top:22px}.card,.ins,.kpi,.pod{box-shadow:none;border:1px solid var(--n-200)}tr{break-inside:avoid}h2{break-after:avoid}
@page{size:A4;margin:12mm}}
`;

export function renderReport(d: ReportData): string {
  const ranked = d.ranking;
  const maxScore = Math.max(1, ...ranked.map((r) => r.score));
  const top3 = ranked.slice(0, 3);
  const winners = ranked.filter((r) => r.isWinner);

  const kpis = `<div class="grid4">
    <div class="kpi"><span>참여자</span><strong>${num(d.participantCount)}<small>명</small></strong></div>
    <div class="kpi"><span>출제 문항</span><strong>${num(d.questionCount)}<small>개</small></strong></div>
    <div class="kpi"><span>평균 정답률</span><strong>${Math.round(d.avgCorrectRate * 100)}<small>%</small></strong></div>
    <div class="kpi"><span>평균 정답 시간</span><strong>${d.avgCorrectMs === null ? '–' : (d.avgCorrectMs / 1000).toFixed(1)}<small>${d.avgCorrectMs === null ? '' : '초'}</small></strong></div>
  </div>`;

  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean) as typeof top3;
  const podium =
    top3.length === 0
      ? `<div class="card empty">참여자가 없어요.</div>`
      : `<div class="podium">${podiumOrder
          .map(
            (r) => `<div class="pod p${r.rank <= 3 ? r.rank : 3}">
              <div class="medal">${r.rank}</div>
              <div class="nm">${esc(r.nickname)}</div>
              <div class="sc">${num(r.score)}점</div>
              <div class="sub">정답 ${r.correctCount}/${d.questionCount} · 평균 ${sec(r.avgCorrectMs)}</div>
            </div>`,
          )
          .join('')}</div>
        ${
          winners.length
            ? `<div class="winners" aria-label="수상자">${winners
                .map((w) => `<span class="chip"><i>${w.rank}위</i>${esc(w.nickname)}</span>`)
                .join('')}</div>`
            : ''
        }`;

  // insights
  const withRate = d.questions
    .filter((q) => q.participantCount > 0)
    .map((q) => ({ q, rate: pct(q.correctCount, q.participantCount) }));
  const hardest = [...withRate].sort((a, b) => a.rate - b.rate || a.q.index - b.q.index)[0];
  const easiest = [...withRate].sort((a, b) => b.rate - a.rate || a.q.index - b.q.index)[0];
  const fastest = d.questions
    .filter((q) => q.fastest)
    .map((q) => ({ q, f: q.fastest! }))
    .sort((a, b) => a.f.elapsedMs - b.f.elapsedMs)[0];
  const qLabel = (q: ReportData['questions'][number]) => esc(q.title || q.text || `문제 ${q.index + 1}`);
  const insights = `<div class="insights">
    <div class="ins"><div class="k">가장 어려웠던 문제</div>${
      hardest ? `<div class="v">Q${hardest.q.index + 1} · ${hardest.rate}%</div><div class="d">${qLabel(hardest.q)}</div>` : `<div class="v">–</div>`
    }</div>
    <div class="ins"><div class="k">가장 쉬웠던 문제</div>${
      easiest ? `<div class="v">Q${easiest.q.index + 1} · ${easiest.rate}%</div><div class="d">${qLabel(easiest.q)}</div>` : `<div class="v">–</div>`
    }</div>
    <div class="ins"><div class="k">가장 빠른 정답</div>${
      fastest
        ? `<div class="v">${esc(fastest.f.nickname)} · ${sec(fastest.f.elapsedMs)}</div><div class="d">Q${fastest.q.index + 1}</div>`
        : `<div class="v">–</div>`
    }</div>
  </div>`;

  const table = ranked.length
    ? `<div class="card"><table>
        <thead><tr><th>순위</th><th>닉네임</th><th class="hide-s"></th><th class="num">점수</th><th class="num">정답</th><th class="num hide-s">정답률</th><th class="num hide-s">평균 정답 시간</th></tr></thead>
        <tbody>${ranked
          .map(
            (r) => `<tr class="${r.isWinner ? 'win' : ''}">
              <td class="r"><span class="rk${r.rank <= 3 ? ` t${r.rank}` : ''}">${r.rank}</span></td>
              <td class="nick">${esc(r.nickname)}${r.isWinner ? '<span class="win-b">수상</span>' : ''}</td>
              <td class="hide-s" style="width:26%"><div class="bar"><b style="width:${pct(r.score, maxScore)}%"></b></div></td>
              <td class="num">${num(r.score)}</td>
              <td class="num">${r.correctCount}/${d.questionCount}</td>
              <td class="num hide-s">${pct(r.correctCount, d.questionCount)}%</td>
              <td class="num hide-s">${sec(r.avgCorrectMs)}</td>
            </tr>`,
          )
          .join('')}</tbody></table></div>`
    : `<div class="card empty">순위 데이터가 없어요.</div>`;

  const questions = d.questions
    .map((q) => {
      const rate = pct(q.correctCount, q.participantCount);
      const maxCount = Math.max(1, ...q.choices.map((c) => c.count));
      return `<article class="card q">
        <div>${ring(rate, rateTone(rate))}</div>
        <div>
          <div class="no">Q${q.index + 1}${q.kind === 'HTML' ? ' · HTML' : ''}</div>
          ${q.title ? `<h3>${esc(q.title)}</h3>` : ''}
          <p class="t">${esc(q.text)}</p>
          <div class="stats">
            <span>응답 <b>${q.answeredCount}/${q.participantCount}명</b></span>
            <span>정답 <b>${q.correctCount}명</b></span>
            <span>평균 응답 시간 <b>${sec(q.avgElapsedMs)}</b></span>
            ${q.fastest ? `<span>최속 정답 <b>${esc(q.fastest.nickname)} (${sec(q.fastest.elapsedMs)})</b></span>` : ''}
          </div>
          ${q.choices
            .map(
              (c) => `<div class="ch${c.isCorrect ? ' ok' : ''}">
                <span class="l">${c.isCorrect ? '✓' : c.position + 1}</span>
                <div class="tx"><span>${esc(c.text)}</span><div class="meter"><b style="width:${pct(c.count, maxCount)}%"></b></div></div>
                <span class="n">${c.count}명 · ${pct(c.count, q.answeredCount)}%</span>
              </div>`,
            )
            .join('')}
        </div>
      </article>`;
    })
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(d.room.title)} · 퀴즈 리포트</title>
<style>${CSS}</style>
</head>
<body>
<header class="hero"><div class="wrap">
  <span class="eyebrow">QUIZ REPORT</span>
  <h1>${esc(d.room.title)}</h1>
  <div class="meta">
    <span><b>${esc(dateText(d.room.startedAt ?? d.generatedAt))}</b> 진행</span>
    <span>소요 시간 <b>${esc(durationText(d.room.startedAt, d.room.finishedAt))}</b></span>
    <span>수상 인원 <b>${d.room.prizeCount}명</b></span>
  </div>
</div></header>
<main class="wrap">
  ${kpis}
  <section><h2>시상대</h2>${podium}</section>
  <section><h2>하이라이트</h2>${insights}</section>
  ${ranked.length ? `<section><h2>점수 분포</h2><div class="card">${histogram(ranked.map((r) => r.score))}</div></section>` : ''}
  <section><h2>전체 순위</h2>${table}</section>
  <section><h2>문항별 분석</h2>${questions || '<div class="card empty">문항 데이터가 없어요.</div>'}</section>
  <footer>스피드 퀴즈 · ${esc(dateText(d.generatedAt))} 생성</footer>
</main>
</body>
</html>`;
}
