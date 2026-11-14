import { useNavigate } from 'react-router';
import { m } from 'motion/react';
import { Play } from 'lucide-react';
import { spring } from '@/design/motion';
import { JoinQR } from '@/game/effects';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Dialog';
import { CopyField } from '../components/common';

export function RoomCode({ code, className }: { code: string; className?: string }) {
  return (
    <span className={`tabular font-display tracking-[0.12em] ${className ?? ''}`} aria-label={`방 코드 ${code.split('').join(' ')}`}>
      {code}
    </span>
  );
}

/** Join URL + QR + presenter link (used on the detail page and after confirming). */
export function JoinInfo({ code, joinUrl, presenterUrl, compact }: { code: string; joinUrl: string; presenterUrl: string | null; compact?: boolean }) {
  return (
    <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-3">
        <JoinQR url={joinUrl} size={compact ? 168 : 200} />
        <div className="rounded-md bg-ink px-5 py-2 text-center text-white">
          <p className="text-xs font-bold text-spark-200">방 코드</p>
          <RoomCode code={code} className="text-3xl" />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <CopyField label="참여 주소" copyLabel="참여 주소" value={joinUrl} />
        {presenterUrl && <CopyField label="진행 화면 주소 (다른 PC·프로젝터용)" copyLabel="진행 화면 주소" value={presenterUrl} />}
        <p className="text-sm text-fg-muted">
          참여자는 QR을 찍거나 주소에 접속해서 닉네임만 입력하면 들어올 수 있어요. 진행 화면 주소는 로그인 없이 화면을 띄울 수 있으니 공유에 주의해 주세요.
        </p>
      </div>
    </div>
  );
}

export function ConfirmSuccessModal({
  open,
  onOpenChange,
  roomId,
  code,
  joinUrl,
  presenterUrl,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomId: number;
  code: string;
  joinUrl: string;
  presenterUrl: string;
}) {
  const navigate = useNavigate();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="퀴즈방이 열렸어요! 🎉"
      description="이제 참여자들이 들어올 수 있어요. 진행 화면에서 문제를 출제하세요."
      footer={
        <>
          <Button variant="ghost" onClick={() => navigate(`/admin/rooms/${roomId}`)}>
            상세 보기
          </Button>
          <Button variant="ink" icon={<Play className="size-5" />} onClick={() => navigate(`/admin/rooms/${roomId}/live`)}>
            진행 화면으로
          </Button>
        </>
      }
    >
      <m.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop}>
        <JoinInfo code={code} joinUrl={joinUrl} presenterUrl={presenterUrl} />
      </m.div>
    </Modal>
  );
}
