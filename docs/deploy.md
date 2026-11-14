# 배포 가이드

빌드 결과물은 `dist/` 폴더 하나입니다. 런타임에는 `node_modules`가 필요 없습니다.

```
<APP_ROOT>/
  dist/server.js        서버 번들
  dist/public/          웹 화면(사전 압축 .br/.gz 포함)
  dist/package.json     {"type":"module"}
  .env                  설정
  data/                 speed-quiz.db, uploads/, backups/  (자동 생성)
```

1. 빌드 PC에서 `pnpm install --frozen-lockfile && pnpm build`
2. `dist/`와 `.env`를 서버의 `<APP_ROOT>`에 복사 (데이터는 `data/`에 쌓입니다)
3. 서버에 Node.js 22.13+ 설치 후 실행: `node --disable-warning=ExperimentalWarning dist/server.js`

> `node:sqlite`는 Node 22에서 "실험적" 경고를 출력하지만 정상 동작합니다. 경고는 위 플래그로 숨깁니다.
> DB는 반드시 로컬 디스크에 두세요(네트워크 공유 드라이브에서는 SQLite 잠금이 불안정합니다).

## 리눅스 (systemd)

```ini
# /etc/systemd/system/speed-quiz.service
[Unit]
Description=Speed Quiz
After=network.target

[Service]
User=speedquiz
WorkingDirectory=/opt/speed-quiz
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning /opt/speed-quiz/dist/server.js
Restart=on-failure
RestartSec=2
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now speed-quiz
sudo journalctl -u speed-quiz -f        # 로그 (최초 관리자 비밀번호도 여기 출력)
sudo firewall-cmd --add-port=3000/tcp --permanent && sudo firewall-cmd --reload   # 필요 시
```

## 윈도우 서버 (NSSM 서비스)

[NSSM](https://nssm.cc)으로 서비스 등록을 권장합니다(pm2는 윈도우 서비스로 불안정).

```bat
nssm install SpeedQuiz "C:\Program Files\nodejs\node.exe"
nssm set SpeedQuiz AppParameters "--disable-warning=ExperimentalWarning C:\speed-quiz\dist\server.js"
nssm set SpeedQuiz AppDirectory C:\speed-quiz
nssm set SpeedQuiz AppStdout C:\speed-quiz\logs\out.log
nssm set SpeedQuiz AppStderr C:\speed-quiz\logs\err.log
nssm set SpeedQuiz AppRotateFiles 1
nssm set SpeedQuiz AppStopMethodConsole 5000
nssm start SpeedQuiz

netsh advfirewall firewall add rule name="SpeedQuiz" dir=in action=allow protocol=TCP localport=3000
```

서비스를 멈추면 서버가 진행 중인 데이터를 저장하고 정상 종료합니다(SIGINT/SIGBREAK 처리).

## Docker (선택)

```dockerfile
FROM node:22-slim AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-slim
WORKDIR /app
COPY --from=build /src/dist ./dist
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
VOLUME /app/data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.js"]
```

## 리버스 프록시 / HTTPS

WebSocket 업그레이드를 반드시 전달해야 합니다. 프록시 뒤에서는 `.env`에 `TRUST_PROXY=true`, HTTPS면 `COOKIE_SECURE=true`, 그리고 `PUBLIC_BASE_URL=https://quiz.example.com`을 설정하세요.

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

IIS를 쓴다면 ARR + URL Rewrite에 **WebSocket 프로토콜** 기능을 켜야 합니다.

## 행사 당일 체크리스트

- [ ] 참가자 휴대폰이 서버에 접속 가능한 네트워크인지(사내 Wi-Fi ↔ 서버 대역) 확인, QR 주소(`PUBLIC_BASE_URL`)가 `localhost`가 아닌지 확인
- [ ] 퀴즈방 상세의 **리허설 초기화**로 미리 한 번 돌려보기 (참가자·응답만 지워지고 문제 구성은 유지)
- [ ] 진행 화면은 첫 클릭 "시작하기"로 효과음·전체화면을 켜고, 어두운 행사장이면 툴바에서 무대 테마 선택
- [ ] 진행 화면을 다른 PC(프로젝터 PC)에서 띄울 때는 `/screen/<방ID>#key=…` 링크 사용 (관리자 로그인 불필요)
- [ ] 진행 중 서버가 재시작돼도 방·점수·타이머는 복구됩니다. 참가자는 새로고침하면 그대로 이어서 참여
- [ ] 종료 후 퀴즈방 상세에서 순위/응답 CSV 다운로드 (엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 포함)

## 백업

방이 종료될 때와 매일 한 번 `data/backups/`에 DB 스냅샷이 생성되며 최근 14개를 보관합니다.
복원은 서버를 멈춘 뒤 원하는 백업 파일을 `data/speed-quiz.db`로 복사하면 됩니다.

## GitHub Actions 배포 (self-hosted runner + pm2)

서버에 설치한 self-hosted runner가 `.github/workflows/deploy.yml`을 실행합니다. **수동 실행 전용**입니다
(Actions 탭 → Deploy → Run workflow). 동작은 `scripts/deploy.sh`: `git pull --ff-only` →
`pnpm install --frozen-lockfile` → `pnpm build` → `pm2 restart` → `/api/health` 확인.

러너는 서버에서 GitHub로 나가는 연결(아웃바운드 443)만 사용하므로 인바운드 포트 개방과 SSH 시크릿이 필요 없습니다.

**서버 사전 조건**
- 러너를 `~/speed-quiz`와 pm2를 소유한 **같은 계정**으로 설치·서비스 등록 (다른 계정이면 다른 pm2 데몬을 보게 됨)
- `~/speed-quiz`는 이 저장소의 git clone (`git pull` 가능해야 함), Node 22.13+, pnpm, pm2 설치
- RHEL 계열에서 서비스가 `status=203/EXEC`로 실패하면 SELinux 라벨 문제:
  `sudo chcon -t bin_t <러너폴더>/runsvc.sh` (영구 적용은 `semanage fcontext` + `restorecon`)

**선택 설정** (Settings → Secrets and variables → Actions → Variables)

| 이름 | 기본값 | 설명 |
|---|---|---|
| `PM2_APP` | `speed-quiz` | `pm2 ls`의 name |
| `APP_DIR` | `~/speed-quiz` | 서비스 폴더 절대 경로 |

**보안**: 저장소 쓰기 권한이 있는 사람은 서버에서 코드를 실행할 수 있습니다. `pull_request` 등 자동 트리거를
추가하지 말고(특히 public 저장소), `main` 브랜치 보호를 켜 두세요.
