import { Link, useRouteError } from 'react-router';
import { Logo } from '@/ui/display';

export function RouteError() {
  const err = useRouteError() as Error | undefined;
  const chunkFailed = err?.message?.includes('dynamically imported module') || err?.message?.includes('Failed to fetch');
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo />
      <h1 className="text-2xl font-extrabold">{chunkFailed ? '새 버전이 배포되었어요' : '문제가 발생했어요'}</h1>
      <p className="text-fg-muted">{chunkFailed ? '페이지를 새로고침해 주세요.' : '잠시 후 다시 시도해 주세요.'}</p>
      <button className="rounded-md bg-ink px-5 py-3 font-bold text-white" onClick={() => window.location.reload()}>
        새로고침
      </button>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo />
      <h1 className="text-2xl font-extrabold">페이지를 찾을 수 없어요</h1>
      <Link to="/join" className="rounded-md bg-spark-400 px-5 py-3 font-bold text-ink">
        퀴즈 참여하러 가기
      </Link>
    </div>
  );
}
