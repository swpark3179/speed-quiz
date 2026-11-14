import { useState } from 'react';
import { m } from 'motion/react';
import { toast } from 'sonner';
import { KeyRound, Plus, ShieldCheck, ShieldOff, UserPlus } from 'lucide-react';
import { AdminCreateInput, DISPLAY_NAME_MAX, PASSWORD_MIN, type AdminDto } from '@sq/shared';
import { cappedStagger, spring } from '@/design/motion';
import { errorText } from '@/lib/api';
import { cn, dateTime } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/dom';
import { Button } from '@/ui/Button';
import { Avatar, Badge, EmptyState, Spinner } from '@/ui/display';
import { ConfirmDialog, Modal } from '@/ui/Dialog';
import { TextField } from '@/ui/fields';
import { useAdmins, useCreateAdmin, usePatchAdmin } from '../api';
import { useMe } from '../session';
import { PageHeader, PasswordChangeDialog, SectionCard } from '../components/common';

function CreateAdminDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [form, setForm] = useState({ username: '', displayName: '', password: '' });
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const create = useCreateAdmin();
  const close = (v: boolean) => {
    if (!v) {
      setForm({ username: '', displayName: '', password: '' });
      setError(null);
    }
    onOpenChange(v);
  };
  const submit = async () => {
    const parsed = AdminCreateInput.safeParse(form);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError({ field: String(issue?.path[0] ?? ''), message: issue?.message ?? '입력값을 확인해 주세요.' });
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      toast.success(`${parsed.data.displayName} 관리자를 추가했어요.`);
      close(false);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError({ field: code === 'DISPLAY_NAME_TAKEN' ? 'displayName' : 'username', message: errorText(err) });
    }
  };
  const err = (f: string) => (error?.field === f ? error.message : null);
  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="관리자 추가"
      description="추가한 관리자는 자신의 퀴즈방과 문제은행을 따로 관리해요. 필요하면 추가한 뒤 메인 권한을 줄 수 있어요."
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            취소
          </Button>
          <Button loading={create.isPending} onClick={submit} icon={<UserPlus className="size-5" />}>
            추가하기
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label="아이디"
          autoCapitalize="none"
          autoComplete="off"
          hint="영문, 숫자, . _ - 만 사용할 수 있어요."
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          error={err('username')}
        />
        <TextField
          label="닉네임"
          maxLength={DISPLAY_NAME_MAX}
          hint="다른 관리자와 겹치지 않아야 해요."
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          error={err('displayName')}
        />
        <TextField
          label="초기 비밀번호"
          type="password"
          autoComplete="new-password"
          hint={`${PASSWORD_MIN}자 이상. 첫 로그인 후 변경하도록 안내해 주세요.`}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={err('password')}
        />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ admin, onClose }: { admin: AdminDto | null; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const patchAdmin = usePatchAdmin();
  const close = () => {
    setPw('');
    setError(null);
    onClose();
  };
  const submit = async () => {
    if (!admin) return;
    if (pw.length < PASSWORD_MIN) return setError(`비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.`);
    try {
      await patchAdmin.mutateAsync({ id: admin.id, password: pw });
      toast.success(`${admin.displayName}님의 비밀번호를 재설정했어요.`);
      close();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <Modal
      open={!!admin}
      onOpenChange={(v) => !v && close()}
      title="비밀번호 재설정"
      description={admin ? `${admin.displayName}(${admin.username}) 계정의 새 비밀번호를 정해 주세요. 기존 로그인은 모두 해제돼요.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            취소
          </Button>
          <Button loading={patchAdmin.isPending} onClick={submit}>
            재설정
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label="새 비밀번호" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={error} />
      </form>
    </Modal>
  );
}

export default function AccountsPage() {
  useDocumentTitle('관리자 계정');
  const me = useMe();
  const admins = useAdmins();
  const patchAdmin = usePatchAdmin();
  const [createOpen, setCreateOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [resetFor, setResetFor] = useState<AdminDto | null>(null);
  const [toggleFor, setToggleFor] = useState<AdminDto | null>(null);
  const [roleFor, setRoleFor] = useState<AdminDto | null>(null);
  const granting = roleFor?.role !== 'MAIN';

  return (
    <>
      <PageHeader
        title="관리자 계정"
        description="일반 관리자는 자신이 만든 퀴즈방과 문제은행만 다뤄요. 메인 관리자는 계정 관리와 이용 현황을 볼 수 있고, 다른 계정에 메인 권한을 주거나 뺄 수 있어요."
        actions={
          <Button icon={<Plus className="size-5" />} onClick={() => setCreateOpen(true)}>
            관리자 추가
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        <SectionCard title="관리자 목록">
          {admins.isPending ? (
            <div className="flex justify-center py-10 text-n-400">
              <Spinner className="size-7" />
            </div>
          ) : admins.isError ? (
            <EmptyState title="목록을 불러오지 못했어요">{errorText(admins.error)}</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {admins.data.map((a, i) => {
                const self = a.id === me.data?.id;
                return (
                  <m.li
                    key={a.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.gentle, delay: cappedStagger(i) }}
                    className={cn('flex flex-col gap-3 py-4 sm:flex-row sm:items-center', a.disabled && 'opacity-60')}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar id={a.id} name={a.displayName} size={44} />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-bold">
                          <span className="truncate">{a.displayName}</span>
                          {self && <Badge tone="spark">나</Badge>}
                          {a.role === 'MAIN' && <Badge tone="ink">메인</Badge>}
                          {a.disabled ? <Badge tone="neutral">비활성</Badge> : <Badge tone="success" dot>활성</Badge>}
                        </p>
                        <p className="truncate text-sm text-fg-muted">
                          {a.username} · 마지막 로그인 {a.lastLoginAt ? dateTime(a.lastLoginAt) : '없음'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-14 sm:pl-0">
                      {self ? (
                        <Button size="sm" variant="subtle" icon={<KeyRound className="size-4" />} onClick={() => setPwOpen(true)}>
                          내 비밀번호 변경
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="subtle" icon={<KeyRound className="size-4" />} onClick={() => setResetFor(a)}>
                            비밀번호 재설정
                          </Button>
                          <Button
                            size="sm"
                            variant="subtle"
                            icon={a.role === 'MAIN' ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
                            onClick={() => setRoleFor(a)}
                          >
                            {a.role === 'MAIN' ? '메인 권한 해제' : '메인 권한 부여'}
                          </Button>
                          <Button
                            size="sm"
                            variant={a.disabled ? 'success' : 'ghost'}
                            onClick={() => (a.disabled ? patchAdmin.mutate({ id: a.id, disabled: false }, { onSuccess: () => toast.success('계정을 활성화했어요.'), onError: (e) => toast.error(errorText(e)) }) : setToggleFor(a))}
                          >
                            {a.disabled ? '활성화' : '비활성화'}
                          </Button>
                        </>
                      )}
                    </div>
                  </m.li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="내 비밀번호 변경" description="비밀번호를 바꾸면 다른 기기에서의 로그인은 해제돼요.">
          <Button variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => setPwOpen(true)}>
            비밀번호 변경하기
          </Button>
        </SectionCard>
      </div>

      <CreateAdminDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ResetPasswordDialog admin={resetFor} onClose={() => setResetFor(null)} />
      <PasswordChangeDialog open={pwOpen} onOpenChange={setPwOpen} />
      <ConfirmDialog
        open={!!roleFor}
        onOpenChange={(v) => !v && setRoleFor(null)}
        title={granting ? `${roleFor?.displayName ?? ''}님에게 메인 권한을 줄까요?` : `${roleFor?.displayName ?? ''}님의 메인 권한을 해제할까요?`}
        description={
          granting
            ? '메인 관리자는 관리자 계정 추가·비활성화·비밀번호 재설정, 메인 권한 부여·해제, 이용 현황 화면을 쓸 수 있어요. 다른 관리자의 비공개 문제와 퀴즈방 내용은 메인도 볼 수 없어요.'
            : '해제하면 바로 일반 관리자가 되어 관리자 관리·현황 화면을 쓸 수 없어요. 만든 문제와 퀴즈방은 그대로 남아요.'
        }
        confirmLabel={granting ? '메인 권한 부여' : '권한 해제'}
        tone={granting ? undefined : 'danger'}
        onConfirm={async () => {
          if (!roleFor) return;
          try {
            await patchAdmin.mutateAsync({ id: roleFor.id, role: granting ? 'MAIN' : 'ADMIN' });
            toast.success(granting ? `${roleFor.displayName}님을 메인 관리자로 지정했어요.` : `${roleFor.displayName}님의 메인 권한을 해제했어요.`);
          } catch (err) {
            toast.error(errorText(err));
          }
        }}
      />
      <ConfirmDialog
        open={!!toggleFor}
        onOpenChange={(v) => !v && setToggleFor(null)}
        title={`${toggleFor?.displayName ?? ''} 계정을 비활성화할까요?`}
        description="비활성화하면 바로 로그아웃되고 다시 로그인할 수 없어요. 언제든 다시 활성화할 수 있어요."
        confirmLabel="비활성화"
        tone="danger"
        onConfirm={async () => {
          if (!toggleFor) return;
          try {
            await patchAdmin.mutateAsync({ id: toggleFor.id, disabled: true });
            toast.success('계정을 비활성화했어요.');
          } catch (err) {
            toast.error(errorText(err));
          }
        }}
      />
    </>
  );
}
