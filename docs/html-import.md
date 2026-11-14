# HTML 묶음(js·css·이미지) 지원 검토

문제 본문은 지금까지 **HTML 조각 하나**만 받았습니다. 실제로 만들어 둔 문제 파일은 `index.html` 하나가 아니라 CSS 파일, 이미지 폴더, 때로는 JS까지 함께 들어 있는 경우가 많습니다. 이런 묶음을 어디까지, 어떤 방식으로 받을지 검토한 내용입니다.

## 결론

**JS는 빼고 가져오는 방식(A안)으로 구현했습니다.** 묶음을 브라우저에서 기존 형식(정제된 HTML 조각)으로 바꾸기 때문에 보안 모델은 바뀌지 않습니다. JS를 실행하는 방식(B안)은 지금은 채택하지 않았고, 나중에 필요하면 아래 조건을 갖춰 따로 만듭니다.

## 위협 모델

문제 본문은 관리자가 쓰지만, 그 내용은 참가자 휴대폰과 발표 화면에 그려집니다. 셀프 가입이 생기면서 "관리자는 믿을 수 있다"는 전제도 약해졌습니다. 그래서 본문을 쓰는 사람은 믿지 않는다고 가정합니다. 막아야 할 것은 다음과 같습니다.

| 위협 | 예 |
|---|---|
| 스크립트 실행 | 관리자 세션 탈취, 다른 관리자 화면 조작 |
| 화면 위장 | 보기 버튼 위에 가짜 버튼을 덮어 오답 유도, 가짜 로그인 폼 |
| 외부 통신 | 참가자 IP 수집(외부 이미지·CSS), 폐쇄망 정책 위반 |
| 서비스 방해 | 무한 루프로 참가자 휴대폰이나 발표 화면 멈춤 |
| 정답 유출 | 스크립트가 소켓 메시지를 엿봄 |

## A안: JS 없이 가져오기 (채택)

문제 편집 화면에서 **HTML 파일 불러오기**를 누르면 다음 세 가지 방식으로 받습니다.

- 파일 여러 개 선택(.html·.css·이미지)
- 폴더 선택
- `.zip` 파일(`fflate`로 브라우저에서 풉니다)

변환은 `apps/web/src/features/admin/questions/html-import.ts`가 하고, 순서는 이렇습니다.

1. **진입 파일을 고릅니다.** 가장 얕은 위치의 `index.html`을 쓰고, 없으면 첫 HTML 파일을 씁니다. `<meta charset>`이 있으면 그 인코딩을 따릅니다(EUC-KR 대응).
2. **`DOMParser`로 파싱합니다.** 이렇게 만든 문서는 스크립트가 실행되지 않고 이미지도 불러오지 않는 inert 상태입니다.
3. **위험한 요소를 제거합니다.**
   - `<script>`, `on*` 속성
   - `iframe/object/embed/form/input/video/audio/canvas/svg/math` 등
4. **CSS를 inline style로 옮깁니다.**
   - 묶음 안의 CSS 파일과 `<style>`을 문서 순서대로 읽습니다.
   - 선택자 우선순위(특이성)와 `!important`를 반영해 요소마다 최종 값을 정합니다.
   - **허용 목록에 있는 속성만** `style` 속성으로 옮깁니다.
   - `@media`, `@font-face`, `@import`, `:hover`, `::before` 같은 규칙과 외부 CSS는 옮길 수 없어 버리고 개수를 셉니다.
5. **이미지를 기존 업로드 경로(`/api/admin/uploads`)로 올립니다.**
   - 묶음 안의 상대경로 이미지와 `data:` 이미지가 대상입니다.
   - 서버가 magic byte로 PNG/JPG/GIF/WebP만 받고, SVG는 거부합니다.
   - 올린 뒤 `src`를 `/uploads/<hash>.ext`로 바꿉니다.
   - 외부 URL 이미지와 묶음에 없는 이미지는 제거합니다.
6. **기존 클라이언트 정제(DOMPurify)를 한 번 더 거칩니다.** 결과 화면에 무엇이 빠졌는지 보여주고, 관리자가 확인해야 본문에 들어갑니다.

저장할 때는 지금처럼 서버의 `sanitize-html`이 같은 허용 목록(`packages/shared/src/sanitize-policy.ts`)으로 다시 정제합니다. **가져오기 코드는 보안 경계가 아닙니다.** 가져오기를 우회해 아무 HTML이나 붙여 넣어도 결과는 똑같습니다.

### 이번에 넓힌 허용 범위

- 태그
  - `h1, h2`: h3/h4보다 약간 큰 크기로만 그립니다.
  - `figure, figcaption, caption, colgroup, col, tfoot, dl, dt, dd`
- style 속성
  - 글자: `font-size, line-height, vertical-align, list-style-type`
  - 표·테두리: `border*, border-radius, border-collapse`
  - 여백·크기: `padding*, margin*, width, max-width`
- 길이 값은 음수가 아닌 `px/em/rem/%/auto`만 받습니다. 음수 margin으로 다른 요소를 덮거나 `calc()`·`vw`로 화면을 넘는 것을 막기 위해서입니다.
- 계속 막는 것
  - `position, z-index, transform, display, float, top/left`: 보기 버튼을 덮지 못하게 합니다.
  - `url()`: 외부에서 아무것도 불러오지 않게 합니다.
  - `expression(), var(), @import`
- 본문 최대 길이는 20,000자에서 60,000자로 늘렸습니다. inline style 때문에 본문이 길어지기 때문입니다.

### 한계

- 인터랙티브 요소(클릭해서 펼치기, 애니메이션, 퀴즈 내장 스크립트)는 동작하지 않습니다.
- 반응형 CSS(`@media`)와 웹폰트는 빠집니다.
- 클래스 기반 스타일은 inline으로 옮겨지기 때문에, 나중에 원본 CSS를 고쳐도 반영되지 않습니다. 다시 불러와야 합니다.

## B안: 격리된 iframe에서 JS 실행 (보류)

묶음을 서버에 그대로 저장하고 `<iframe>`으로 띄우는 방식입니다. 인터랙티브 문제까지 되지만 다음 문제가 있습니다.

- **CSP 상속 문제가 있습니다.** `srcdoc` iframe은 부모 문서의 CSP(`script-src 'self'`)를 물려받아 inline 스크립트가 막힙니다. 그래서 묶음을 별도 경로에서 서빙해야 합니다.
- **서비스 방해를 막을 수 없습니다.** sandbox iframe도 같은 프로세스에서 돌 수 있어, `while(true){}` 하나로 참가자 휴대폰의 퀴즈 화면 전체가 멈출 수 있습니다. 퀴즈 진행 중에는 치명적입니다.
- **화면 위장은 계속 가능합니다.** iframe 영역 안에서는 가짜 보기 버튼이나 로그인 폼을 그릴 수 있습니다.
- **작업량이 큽니다.** 업로드·저장·버전 관리(퀴즈방 확정 시 스냅샷), 백업, 리포트 HTML, 발표 화면 스케일링, 높이 자동 조절(postMessage)을 모두 새로 만들어야 합니다.

나중에 B안을 만든다면 필요한 최소 조건은 다음과 같습니다.

1. 묶음은 내용 해시 경로(`/q-bundles/<sha256>/…`)에 저장하고 바꾸지 않습니다. 퀴즈방 확정 시에는 해시로 고정합니다.
2. 응답 헤더
   - `Content-Security-Policy: sandbox allow-scripts; default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'self'`
   - CSP의 `sandbox` 지시어 덕분에 주소를 직접 열어도 origin이 없는 문서(opaque origin)가 되어 쿠키·스토리지에 접근할 수 없습니다.
3. iframe 속성은 `sandbox="allow-scripts"`만 줍니다. `allow-same-origin`, `allow-top-navigation`, `allow-popups`, `allow-forms`는 주지 않습니다.
4. 가능하면 별도 호스트(서브도메인)에서 서빙해 프로세스 격리를 받습니다.
5. 정답·보기 데이터는 iframe에 넘기지 않습니다. iframe은 문제 본문 표시만 맡습니다.
6. 문제 진행 화면에서는 iframe이 응답하지 않으면(예: 2초간 heartbeat 없음) 본문을 숨기고 텍스트 대체 내용을 보여줍니다.
