import { expect, test, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

const BASE = 'http://127.0.0.1:4173';

async function adminContext(browser: Browser): Promise<{ ctx: BrowserContext; cookie: string }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const res = await ctx.request.post('/api/auth/login', {
    headers: { 'x-requested-with': 'speed-quiz' },
    data: { username: 'admin', password: 'e2e-password' },
  });
  expect(res.ok()).toBeTruthy();
  const cookies = await ctx.cookies();
  const c = cookies.find((x) => x.name === 'sq_admin')!;
  return { ctx, cookie: `${c.name}=${c.value}` };
}

async function apiPost<T>(ctx: BrowserContext, path: string, data: unknown = {}): Promise<T> {
  const res = await ctx.request.post(path, { headers: { 'x-requested-with': 'speed-quiz' }, data });
  expect(res.ok(), `${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

async function setupRoom(ctx: BrowserContext, opts: { title: string; html?: string }) {
  const q1 = await apiPost<{ id: number }>(ctx, '/api/admin/questions', {
    kind: 'HTML',
    body: opts.html ?? '<p>우리 팀의 <b>핵심 가치</b>는?</p>',
    timeLimitSec: 10,
    choices: [
      { text: '도전', isCorrect: true },
      { text: '야근', isCorrect: false },
      { text: '침묵', isCorrect: false },
    ],
  });
  const q2 = await apiPost<{ id: number }>(ctx, '/api/admin/questions', {
    kind: 'TEXT',
    body: '가장 많이 쓰는 협업 도구는?',
    timeLimitSec: 10,
    choices: [
      { text: '메신저', isCorrect: true },
      { text: '팩스', isCorrect: false },
    ],
  });
  const room = await apiPost<{ id: number }>(ctx, '/api/admin/rooms', {
    title: opts.title,
    settings: { readyCountdownSec: 1, prizeCount: 2 },
    items: [{ questionId: q1.id }, { questionId: q2.id }],
  });
  const confirm = await apiPost<{ code: string }>(ctx, `/api/admin/rooms/${room.id}/confirm`);
  return { roomId: room.id, code: confirm.code };
}

async function adminSocket(cookie: string, roomId: number) {
  const s: Socket = io(`${BASE}/admin`, { transports: ['websocket'], extraHeaders: { cookie } });
  await new Promise<void>((r) => s.on('connect', () => r()));
  const w = await s.timeout(5000).emitWithAck('room:watch', { roomId });
  expect(w.ok).toBeTruthy();
  const control = async (cmd: Record<string, unknown>) => {
    const r = await s.timeout(5000).emitWithAck('control', { roomId, ...cmd });
    expect(r.ok, JSON.stringify(r)).toBeTruthy();
    return r.data as { current: { question: { roomQuestionId: number } } | null; winners: { rank: number }[] };
  };
  return { s, control };
}

/** Tap a choice once it is on screen (waits past the 250ms ghost-tap guard). */
async function answer(page: Page, name: RegExp) {
  const btn = page.getByRole('button', { name });
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(450);
  await btn.click();
}

async function joinPhone(browser: Browser, device: keyof typeof devices, code: string, nickname: string): Promise<Page> {
  const ctx = await browser.newContext({ ...devices[device] });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel('닉네임').fill(nickname);
  await page.getByRole('button', { name: '입장하기' }).click();
  await expect(page).toHaveURL(new RegExp(`/play/${code}`));
  await expect(page.getByText('곧 시작해요!')).toBeVisible();
  return page;
}

test('full game: phones join, answer, see results and the ceremony; presenter follows', async ({ browser }) => {
  const external: string[] = [];
  const { ctx: admin, cookie } = await adminContext(browser);
  const { roomId, code } = await setupRoom(admin, { title: 'E2E 퀴즈' });

  const presenter = await admin.newPage();
  await presenter.setViewportSize({ width: 1920, height: 1080 });
  presenter.on('request', (r) => !r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
  await presenter.goto(`/screen/${roomId}`);
  // the presenter shows the code in two groups ("311 374")
  await expect(presenter.getByText(new RegExp(`${code.slice(0, 3)}\\s?${code.slice(3)}`)).first()).toBeVisible();

  const phones = [
    await joinPhone(browser, 'Pixel 7', code, '가나다'),
    await joinPhone(browser, 'iPhone 13', code, '라마바'),
    await joinPhone(browser, 'iPhone 13', code, '사아자'),
  ];
  for (const p of phones) p.on('request', (r) => !r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
  await expect(phones[0]!.getByText(/함께하는 사람/)).toContainText('3');

  const { s, control } = await adminSocket(cookie, roomId);

  // Q1 — phone 0 correct (1st), phone 1 wrong, phone 2 reloads mid-question then answers correct
  await control({ type: 'START_QUESTION', index: 0 });
  await answer(phones[0]!, /1번 동그라미/);
  await expect(phones[0]!.getByText('제출 완료!', { exact: true })).toBeVisible();
  await answer(phones[1]!, /2번 세모/);

  await phones[2]!.reload();
  await answer(phones[2]!, /1번 동그라미/);
  // all answered → auto close → reveal
  await expect(phones[0]!.getByText('정답!', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(phones[1]!.getByText('땡!', { exact: true })).toBeVisible();
  await expect(phones[0]!.getByText('+1,000')).toBeVisible();

  // Corner ranking appears once the reveal animation has settled, with my own rank; survives a reload
  const rank = phones[0]!.getByRole('region', { name: '현재 순위' });
  await expect(rank).toBeVisible({ timeout: 10_000 });
  await expect(rank).toContainText('내 순위 1위');
  await expect(rank).toContainText('가나다');

  // Reload after answering keeps identity (no re-join)
  await phones[1]!.reload();
  await expect(phones[1]!).toHaveURL(new RegExp(`/play/${code}`));
  await expect(phones[1]!.getByRole('region', { name: '현재 순위' })).toBeVisible({ timeout: 10_000 });

  await control({ type: 'SHOW_LEADERBOARD', index: 0 });
  await expect(presenter.getByText('가나다').first()).toBeVisible();

  // Q2 — everyone answers correctly
  await control({ type: 'START_QUESTION', index: 1 });
  for (const p of phones) await answer(p, /1번 동그라미/);
  await expect(phones[2]!.getByText('정답!', { exact: true })).toBeVisible({ timeout: 10_000 });

  const fin = await control({ type: 'FINISH' });
  expect(fin.winners.map((w) => w.rank)).toEqual([1, 2]);
  await expect(phones[0]!.getByText('결과 발표 중')).toBeVisible();
  // the ranking strip must not spoil the prize ceremony
  await expect(phones[0]!.getByRole('region', { name: '현재 순위' })).toHaveCount(0);
  await control({ type: 'REVEAL_PRIZE', rank: 2 });
  await control({ type: 'REVEAL_PRIZE', rank: 1 });
  await expect(phones[0]!.getByText('1등 수상!', { exact: true })).toBeVisible({ timeout: 15_000 });
  await control({ type: 'END' });
  await expect(phones[1]!.getByText('최종 순위')).toBeVisible({ timeout: 10_000 });

  expect(external, 'no requests to other origins (closed networks)').toEqual([]);
  s.close();
});

test('hostile HTML in a question never executes', async ({ browser }) => {
  const { ctx: admin, cookie } = await adminContext(browser);
  const { roomId, code } = await setupRoom(admin, {
    title: 'XSS 점검',
    html: '<p>안전<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script><a href="javascript:window.__pwned=3">x</a></p>',
  });
  const phone = await joinPhone(browser, 'Pixel 7', code, '보안점검');
  let dialog = false;
  phone.on('dialog', (d) => {
    dialog = true;
    void d.dismiss();
  });
  const { s, control } = await adminSocket(cookie, roomId);
  await control({ type: 'START_QUESTION', index: 0 });
  await expect(phone.getByText('안전').first()).toBeVisible({ timeout: 10_000 });
  expect(await phone.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(dialog).toBe(false);
  s.close();
});

test('a long question scrolls on the presenter screen instead of being clipped', async ({ browser }) => {
  const { ctx: admin, cookie } = await adminContext(browser);
  const lines = Array.from({ length: 16 }, (_, i) => `<p>${i + 1}번째 줄: 긴 문제도 발표 화면에서 끝까지 읽을 수 있어야 해요.</p>`).join('');
  const { roomId } = await setupRoom(admin, { title: '긴 문제', html: `${lines}<p>마지막줄입니다</p>` });
  const presenter = await admin.newPage();
  await presenter.setViewportSize({ width: 1920, height: 1080 });
  await presenter.goto(`/screen/${roomId}`);
  await presenter.getByRole('button', { name: '시작하기' }).click(); // sound/fullscreen gate
  // headless Chromium does not deliver wheel scrolling to fullscreen documents; real browsers do
  await presenter.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 3000 }).catch(() => {});
  await presenter.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  const { s, control } = await adminSocket(cookie, roomId);
  await control({ type: 'START_QUESTION', index: 0 });
  await expect(presenter.getByText('도전').first()).toBeVisible({ timeout: 10_000 }); // past the ready countdown
  const last = presenter.getByText('마지막줄입니다');
  await expect(last).not.toBeInViewport();
  const scroller = presenter.locator('.q-body').first().locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]');
  const dims = await scroller.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  expect(dims.sh, 'long body overflows its card').toBeGreaterThan(dims.ch);
  await scroller.hover();
  await presenter.mouse.wheel(0, 4000);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(last).toBeInViewport();
  s.close();
});

test('wrong room code shows an inline error', async ({ page }) => {
  await page.goto('/join');
  await page.getByLabel('방 코드 6자리').fill('000000');
  await expect(page.getByRole('alert')).toContainText('찾을 수 없어요');
});
