export const ERROR_MESSAGES = {
  BAD_REQUEST: '요청 형식이 올바르지 않아요.',
  UNAUTHORIZED: '로그인이 필요해요.',
  FORBIDDEN: '권한이 없어요.',
  NOT_FOUND: '찾을 수 없어요.',
  CONFLICT: '다른 변경과 충돌했어요. 새로고침 후 다시 시도해 주세요.',
  RATE_LIMITED: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
  INTERNAL: '서버에서 문제가 발생했어요.',
  INVALID_CREDENTIALS: '아이디 또는 비밀번호가 올바르지 않아요.',
  ACCOUNT_DISABLED: '비활성화된 계정이에요.',
  USERNAME_TAKEN: '이미 사용 중인 아이디예요.',
  CANNOT_DISABLE_SELF: '자기 자신은 비활성화할 수 없어요.',
  CANNOT_DEMOTE_SELF: '자기 자신의 메인 권한은 해제할 수 없어요.',
  LAST_MAIN_ADMIN: '활성 메인 관리자가 최소 한 명은 있어야 해요.',
  DISPLAY_NAME_TAKEN: '이미 사용 중인 닉네임이에요.',
  SIGNUP_DISABLED: '지금은 가입을 받지 않고 있어요.',
  NICKNAME_INVALID: '닉네임은 1~12자로 입력해 주세요.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.',
  ROOM_NOT_FOUND: '퀴즈방을 찾을 수 없어요. 코드를 확인해 주세요.',
  ROOM_FULL: '퀴즈방 인원이 가득 찼어요.',
  NOT_JOINABLE: '지금은 입장할 수 없는 퀴즈방이에요.',
  KICKED: '퀴즈방에서 내보내졌어요.',
  NOT_ACTIVE: '지금은 응답할 수 없어요.',
  NOT_OPEN_YET: '아직 보기가 열리지 않았어요.',
  LATE: '마감되어 제출되지 않았어요.',
  ALREADY_ANSWERED: '이미 응답했어요.',
  INVALID_CHOICE: '잘못된 보기예요.',
  STALE: '화면이 최신 상태가 아니에요. 다시 시도해 주세요.',
  INVALID_TRANSITION: '지금 단계에서는 할 수 없는 동작이에요.',
  ROOM_NOT_DRAFT: '확정된 퀴즈방은 수정할 수 없어요.',
  ROOM_INVALID: '퀴즈방 구성이 올바르지 않아요.',
  ROOM_EMPTY: '문제를 한 개 이상 선택해 주세요.',
  ROOM_LIVE: '진행 중인 퀴즈방은 삭제할 수 없어요.',
  QUESTION_INVALID: '문제 구성이 올바르지 않아요.',
  UPLOAD_INVALID: 'PNG, JPG, GIF, WebP 이미지만 올릴 수 있어요.',
  UPLOAD_TOO_LARGE: '이미지 파일이 너무 커요.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export function errorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INTERNAL;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(code: ErrorCode, message?: string): Result<T> {
  return { ok: false, code, message: message ?? errorMessage(code) };
}

/** Error thrown inside server code; converted to Result / HTTP response at the edges. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, message?: string, status?: number) {
    super(message ?? errorMessage(code));
    this.code = code;
    this.status = status ?? defaultStatus(code);
  }
}

function defaultStatus(code: ErrorCode): number {
  switch (code) {
    case 'UNAUTHORIZED':
    case 'INVALID_CREDENTIALS':
      return 401;
    case 'FORBIDDEN':
    case 'ACCOUNT_DISABLED':
    case 'SIGNUP_DISABLED':
    case 'KICKED':
      return 403;
    case 'NOT_FOUND':
    case 'ROOM_NOT_FOUND':
      return 404;
    case 'RATE_LIMITED':
      return 429;
    case 'INTERNAL':
      return 500;
    case 'UPLOAD_TOO_LARGE':
      return 413;
    case 'CONFLICT':
    case 'NICKNAME_TAKEN':
    case 'USERNAME_TAKEN':
    case 'DISPLAY_NAME_TAKEN':
    case 'LAST_MAIN_ADMIN':
    case 'ROOM_FULL':
    case 'NOT_JOINABLE':
    case 'ROOM_NOT_DRAFT':
    case 'ROOM_LIVE':
    case 'STALE':
    case 'INVALID_TRANSITION':
      return 409;
    default:
      return 400;
  }
}
