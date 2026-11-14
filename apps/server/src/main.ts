import readline from 'node:readline';
import { AdminCreateInput, PASSWORD_MIN } from '@sq/shared';
import { baseUrlFor, lanAddresses, loadConfig } from './config';
import { buildApp } from './app';
import { Db } from './db/driver';
import { migrate } from './db/migrations';
import { hashPassword } from './auth/password';
import { adminsRepo } from './db/repos/admins';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

async function adminCommand(kind: 'create' | 'passwd'): Promise<void> {
  const config = loadConfig();
  const db = new Db(config.dbPath);
  migrate(db);
  const username = arg('username') ?? (await prompt('아이디: '));
  const password = arg('password') ?? (await prompt(`비밀번호(${PASSWORD_MIN}자 이상): `));
  if (password.length < PASSWORD_MIN) {
    console.error(`비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.`);
    process.exit(1);
  }
  const existing = adminsRepo.byUsername(db, username);
  if (kind === 'create') {
    const parsed = AdminCreateInput.safeParse({ username, displayName: arg('name') ?? username, password });
    if (!parsed.success) {
      console.error(parsed.error.issues[0]?.message);
      process.exit(1);
    }
    if (existing) {
      console.error('이미 있는 아이디예요.');
      process.exit(1);
    }
    const role = adminsRepo.count(db) === 0 ? 'MAIN' : 'ADMIN';
    adminsRepo.insert(db, { username, displayName: parsed.data.displayName, passwordHash: await hashPassword(password), role });
    console.log(`관리자 '${username}' 계정을 만들었어요.`);
  } else {
    if (!existing) {
      console.error('없는 아이디예요.');
      process.exit(1);
    }
    adminsRepo.setPassword(db, existing.id, await hashPassword(password));
    adminsRepo.update(db, existing.id, { disabled: false });
    db.run('DELETE FROM sessions WHERE admin_id = ?', existing.id);
    console.log(`'${username}' 계정의 비밀번호를 바꿨어요.`);
  }
  db.close();
}

async function serve(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);
  await app.fastify.listen({ host: config.host, port: config.port });
  const base = baseUrlFor(config, null);
  const lines = [
    '',
    '  ⚡ 스피드 퀴즈 서버가 시작됐어요',
    `  관리자 화면   ${base}/admin`,
    `  참여 주소     ${base}/join`,
    ...lanAddresses().map((ip) => `  LAN          http://${ip}:${config.port}`),
    '',
  ];
  console.log(lines.join('\n'));

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.fastify.log.info(`${signal} 신호를 받아 종료합니다…`);
    const force = setTimeout(() => process.exit(1), 8000);
    force.unref();
    await app.close();
    process.exit(0);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
    process.on(sig, () => void shutdown(sig));
  }
}

const cmd = process.argv[2];
if (cmd === 'admin:create') await adminCommand('create');
else if (cmd === 'admin:passwd') await adminCommand('passwd');
else await serve();
