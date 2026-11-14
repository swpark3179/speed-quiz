import { m } from 'motion/react';
import { Ban, MonitorSmartphone, RotateCcw } from 'lucide-react';
import { spring } from '@/design/motion';
import { Button } from '@/ui/Button';

const COPY = {
  KICKED: { icon: Ban, title: '퀴즈방에서 나가게 됐어요', body: '진행자가 참가를 취소했어요. 궁금한 점은 진행자에게 문의해 주세요.' },
  REPLACED: { icon: MonitorSmartphone, title: '다른 화면에서 접속 중이에요', body: '같은 닉네임으로 다른 탭이나 기기에서 접속했어요. 이 화면은 더 이상 사용되지 않아요.' },
  RESET: { icon: RotateCcw, title: '퀴즈방이 초기화됐어요', body: '진행자가 퀴즈를 다시 준비하고 있어요. 다시 입장해 주세요.' },
  UNAUTHORIZED: { icon: Ban, title: '입장 정보가 만료됐어요', body: '다시 입장해 주세요.' },
} as const;

export function EndStateScreen({ reason, code }: { reason: keyof typeof COPY; code: string }) {
  const c = COPY[reason];
  const Icon = c.icon;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
      <m.span
        className="flex size-20 items-center justify-center rounded-full bg-n-100 text-n-600"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={spring.pop}
      >
        <Icon className="size-10" />
      </m.span>
      <h1 className="font-display text-3xl">{c.title}</h1>
      <p className="max-w-sm text-fg-muted">{c.body}</p>
      {reason !== 'KICKED' && (
        <Button size="lg" onClick={() => window.location.assign(reason === 'REPLACED' ? `/play/${code}` : `/join/${code}`)}>
          {reason === 'REPLACED' ? '이 화면에서 계속하기' : '다시 입장하기'}
        </Button>
      )}
    </div>
  );
}
