import { useMemo, useState } from 'react';
import { Check, UserX, Users } from 'lucide-react';
import type { AdminParticipant, AdminSnapshot } from '@sq/shared';
import { Avatar, Card } from '@/ui/display';
import { ConfirmDialog } from '@/ui/Dialog';
import { cn, num } from '@/lib/format';

const PAGE = 200;

export function ParticipantsPanel({ snap, onKick }: { snap: AdminSnapshot; onKick: (p: AdminParticipant) => Promise<unknown> }) {
  const [limit, setLimit] = useState(PAGE);
  const [target, setTarget] = useState<AdminParticipant | null>(null);
  const online = useMemo(() => snap.participants.filter((p) => p.connected).length, [snap.participants]);
  const active = snap.room.phase === 'QUESTION_ACTIVE';
  const list = snap.participants.slice(0, limit);

  return (
    <Card className="flex min-h-0 flex-col p-0">
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <Users className="size-5" aria-hidden="true" /> 참가자
        </h2>
        <p className="text-sm font-semibold text-fg-muted">
          <span className="font-black text-success">{num(online)}</span> 온라인 / {num(snap.participants.length)}명
        </p>
      </div>
      {snap.participants.length === 0 ? (
        <p className="px-5 py-10 text-center text-fg-muted">아직 입장한 참가자가 없어요.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin lg:max-h-[calc(100dvh-360px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-left text-xs font-bold text-fg-muted">
              <tr>
                <th className="w-14 py-2 pl-4 text-center whitespace-nowrap">순위</th>
                <th className="py-2 pl-2">닉네임</th>
                {active && <th className="w-12 py-2 text-center">응답</th>}
                <th className="w-20 py-2 pr-2 text-right">점수</th>
                <th className="w-10 py-2 pr-3" aria-label="관리" />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t border-line/60">
                  <td className="tabular py-2 pl-4 text-center font-black text-fg-muted">{p.rank || '-'}</td>
                  <td className="py-2 pl-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="relative">
                        <Avatar id={p.id} name={p.nickname} size={30} />
                        <span
                          className={cn('absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-surface', p.connected ? 'bg-success' : 'bg-n-300')}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[11rem] truncate font-bold" title={p.nickname}>
                          {p.nickname}
                        </span>
                        <span className={cn('block text-xs font-semibold', p.connected ? 'text-success' : 'text-fg-muted')}>
                          {p.connected ? '온라인' : '오프라인'}
                        </span>
                      </span>
                    </div>
                  </td>
                  {active && (
                    <td className="py-2 text-center">
                      {p.answeredCurrent ? (
                        <Check className="mx-auto size-5 text-success" strokeWidth={3} aria-label="응답함" />
                      ) : (
                        <span className="text-n-300" aria-label="미응답">
                          –
                        </span>
                      )}
                    </td>
                  )}
                  <td className="tabular py-2 pr-2 text-right font-black">{num(p.score)}</td>
                  <td className="py-2 pr-3 text-right">
                    <button
                      type="button"
                      onClick={() => setTarget(p)}
                      className="inline-flex size-8 items-center justify-center rounded-sm text-n-400 hover:bg-danger-tint hover:text-danger"
                      aria-label={`${p.nickname} 내보내기`}
                      title="내보내기"
                    >
                      <UserX className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {snap.participants.length > limit && (
            <button
              type="button"
              className="w-full border-t border-line py-3 text-sm font-bold text-info hover:bg-n-50"
              onClick={() => setLimit((l) => l + PAGE)}
            >
              더 보기 ({num(snap.participants.length - limit)}명)
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={!!target}
        onOpenChange={(v) => !v && setTarget(null)}
        title="참가자를 내보낼까요?"
        description={target ? `'${target.nickname}' 님은 퀴즈방에서 나가고, 같은 닉네임은 다른 사람이 쓸 수 있게 돼요.` : undefined}
        confirmLabel="내보내기"
        tone="danger"
        onConfirm={async () => {
          if (target) await onKick(target);
        }}
      />
    </Card>
  );
}
