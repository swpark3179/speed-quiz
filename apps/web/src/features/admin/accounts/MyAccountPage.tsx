import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Save } from 'lucide-react';
import { DISPLAY_NAME_MAX, ProfilePatchInput } from '@sq/shared';
import { errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/dom';
import { Button } from '@/ui/Button';
import { Avatar, Badge, Spinner } from '@/ui/display';
import { TextField } from '@/ui/fields';
import { useUpdateProfile } from '../api';
import { useMe } from '../session';
import { PageHeader, PasswordChangeDialog, SectionCard } from '../components/common';

/** Every admin (main or regular) can see and edit their own account here. */
export default function MyAccountPage() {
  useDocumentTitle('내 계정');
  const me = useMe();
  const update = useUpdateProfile();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    if (me.data) setName(me.data.displayName);
  }, [me.data]);

  if (!me.data) {
    return (
      <div className="flex justify-center py-24 text-n-400">
        <Spinner className="size-8" />
      </div>
    );
  }
  const admin = me.data;
  const dirty = name.trim() !== admin.displayName;

  const submit = async () => {
    const parsed = ProfilePatchInput.safeParse({ displayName: name });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '닉네임을 확인해 주세요.');
    try {
      await update.mutateAsync(parsed.data);
      setError(null);
      toast.success('닉네임을 바꿨어요.');
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <>
      <PageHeader title="내 계정" description="내 계정 정보를 확인하고 닉네임과 비밀번호를 바꿀 수 있어요." />
      <div className="flex max-w-2xl flex-col gap-6">
        <SectionCard>
          <div className="flex items-center gap-4">
            <Avatar id={admin.id} name={admin.displayName} size={64} />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-xl font-extrabold">
                <span className="truncate">{admin.displayName}</span>
                <Badge tone={admin.role === 'MAIN' ? 'ink' : 'neutral'}>{admin.role === 'MAIN' ? '메인 관리자' : '관리자'}</Badge>
              </p>
              <p className="text-sm text-fg-muted">아이디 {admin.username}</p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
            <div>
              <dt className="font-bold text-fg-muted">가입일</dt>
              <dd className="font-semibold">{dateTime(admin.createdAt)}</dd>
            </div>
            <div>
              <dt className="font-bold text-fg-muted">마지막 로그인</dt>
              <dd className="font-semibold">{admin.lastLoginAt ? dateTime(admin.lastLoginAt) : '없음'}</dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="닉네임 변경" description="다른 관리자에게 보이는 이름이에요. 다른 관리자와 겹치지 않아야 해요.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <TextField label="닉네임" maxLength={DISPLAY_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} error={error} />
            <div>
              <Button type="submit" disabled={!dirty} loading={update.isPending} icon={<Save className="size-5" />}>
                저장
              </Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="비밀번호" description="변경하면 다른 기기의 로그인은 모두 해제돼요.">
          <Button variant="subtle" icon={<KeyRound className="size-5" />} onClick={() => setPwOpen(true)}>
            비밀번호 변경
          </Button>
        </SectionCard>
      </div>
      <PasswordChangeDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
}
