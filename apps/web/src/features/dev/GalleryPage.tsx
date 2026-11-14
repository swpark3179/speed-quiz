import { useState } from 'react';
import { CHOICES } from '@/design/choices';
import { ChoiceButton, ChoiceTile, isLongChoiceSet, phoneGridClass, phoneItemClass, stageItemSpan } from '@/game/choices';
import { ChoiceShape } from '@/game/ChoiceShape';
import { RankChip, Stamp, WaitingDots } from '@/game/effects';
import { Button } from '@/ui/Button';
import { Badge, StatusBadge, Avatar, Logo } from '@/ui/display';
import { Segmented, Switch, TextField } from '@/ui/fields';
import { cn } from '@/lib/format';

const SHORT = ['서울', '부산', '대구', '인천', '광주', '대전'];
const LONG = [
  '분기별 목표를 팀원 모두와 투명하게 공유하고 매주 회고하기',
  '새로운 아이디어는 작은 실험으로 빠르게 검증하기',
  '고객의 목소리를 직접 듣는 자리를 정기적으로 만들기',
  '실패 사례도 함께 나누며 배우는 문화 만들기',
  '서로의 성장을 응원하는 피드백 주고받기',
  '회의는 짧고 명확한 결론과 함께 끝내기',
];

/** Dev-only design review gallery: tokens, components and the 2–6 choice layout matrix. */
export default function GalleryPage() {
  const [long, setLong] = useState<'short' | 'long'>('short');
  const [sw, setSw] = useState(true);
  const texts = long === 'long' ? LONG : SHORT;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo />
        <Segmented
          label="보기 길이"
          value={long}
          onChange={setLong}
          options={[
            { value: 'short', label: '짧은 보기' },
            { value: 'long', label: '긴 보기' },
          ]}
        />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">보기 색 · 도형</h2>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {CHOICES.map((c) => (
            <div key={c.index} className="flex flex-col items-center gap-2 rounded-lg p-4 text-white" style={{ background: c.base }}>
              <ChoiceShape shape={c.shape} className="size-10" />
              <b>
                {c.number}번 {c.shapeLabel}
              </b>
              <span className="text-xs opacity-80">{c.hex}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">버튼 · 입력 · 배지</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>기본</Button>
          <Button variant="ink">잉크</Button>
          <Button variant="success">성공</Button>
          <Button variant="danger">위험</Button>
          <Button variant="secondary">보조</Button>
          <Button variant="ghost">고스트</Button>
          <Button size="xl">출제하기</Button>
          <Button loading>저장</Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField label="닉네임" placeholder="예) 번개" counter="0/12" />
          <TextField label="오류 예시" defaultValue="중복" error="이미 사용 중인 닉네임이에요." />
          <Switch checked={sw} onChange={setSw} label="모두 응답하면 자동 마감" description="접속 중인 참가자 기준" />
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="DRAFT" />
          <StatusBadge status="OPEN" />
          <StatusBadge status="LIVE" />
          <StatusBadge status="ENDED" />
          <Badge tone="spark">HTML</Badge>
          <RankChip rank={3} prevRank={7} />
          <RankChip rank={5} prevRank={4} />
          <Avatar id={3} name="김민지" />
          <Avatar id={9} name="🦊여우" />
          <WaitingDots />
        </div>
        <div className="flex flex-wrap items-center gap-8 rounded-lg bg-success p-6">
          <Stamp className="text-5xl">정답!</Stamp>
          <Stamp className="text-5xl" rotate={3}>
            땡!
          </Stamp>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">휴대폰 보기 배치 (2~6개)</h2>
        <div className="flex flex-wrap gap-6">
          {[2, 3, 4, 5, 6].map((n) => {
            const t = texts.slice(0, n);
            const isLong = isLongChoiceSet(t);
            return (
              <div key={n} className="flex flex-col items-center gap-2">
                <span className="font-bold text-fg-muted">{n}개</span>
                <div className="h-[460px] w-[260px] rounded-[2rem] border-8 border-ink bg-bg p-2">
                  <div className={cn('grid h-full gap-2 overflow-y-auto', phoneGridClass(n, isLong))}>
                    {t.map((text, i) => (
                      <div key={i} className={cn('flex min-h-0', phoneItemClass(n, i, isLong))}>
                        <ChoiceButton position={i} text={text} state={i === 1 ? 'selected' : 'idle'} className="h-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">진행 화면 타일 (축소)</h2>
        <div className="flex flex-col gap-6">
          {[2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="overflow-hidden rounded-lg ring-1 ring-line">
              <div className="origin-top-left scale-[0.5]" style={{ width: '200%' }}>
                <div className="grid grid-cols-6 gap-6 bg-bg p-8">
                  {texts.slice(0, n).map((text, i) => (
                    <ChoiceTile key={i} position={i} text={text} state={i === 0 ? 'correct' : 'idle'} className={stageItemSpan(n, i)} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
