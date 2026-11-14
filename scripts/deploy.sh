#!/usr/bin/env bash
# 서버에서 실행되는 배포 스크립트 (GitHub Actions가 SSH로 호출, 수동 실행도 가능)
#   ssh user@server 'bash -s' < scripts/deploy.sh
#
# 환경변수(선택):
#   APP_DIR   앱 폴더            (기본 ~/speed-quiz)
#   BRANCH    배포할 브랜치      (기본 main)
#   PM2_APP   pm2 프로세스 이름  (기본 speed-quiz)  ← `pm2 ls`의 name 열과 일치해야 함
#   PORT      헬스체크 포트      (기본 3000)
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/speed-quiz}"
BRANCH="${BRANCH:-main}"
PM2_APP="${PM2_APP:-speed-quiz}"
PORT="${PORT:-3000}"

# 비대화형 SSH는 .bashrc를 읽지 않아 node/pnpm/pm2가 PATH에 없을 수 있다.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="$HOME/.local/share/pnpm:$HOME/.local/bin:$PATH"

for cmd in git node pnpm pm2; do
  command -v "$cmd" >/dev/null || { echo "ERROR: '$cmd' not found in PATH ($PATH)"; exit 1; }
done

cd "$APP_DIR"
echo "==> node $(node -v) / pnpm $(pnpm -v) / pm2 $(pm2 -v)"

echo "==> git: update to origin/$BRANCH"
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
git merge --ff-only "origin/$BRANCH"   # 서버에서 추적 파일을 수정했다면 여기서 실패 → 수동 정리 필요
echo "    HEAD = $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"

echo "==> pnpm install"
pnpm install --frozen-lockfile

echo "==> pnpm build"
pnpm build

echo "==> pm2 restart $PM2_APP"
pm2 restart "$PM2_APP" --update-env
pm2 save >/dev/null

echo "==> health check (http://127.0.0.1:$PORT/api/health)"
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "    OK"
    exit 0
  fi
  sleep 1
done
echo "ERROR: health check failed. 로그: pm2 logs $PM2_APP --lines 50"
pm2 logs "$PM2_APP" --lines 30 --nostream || true
exit 1
