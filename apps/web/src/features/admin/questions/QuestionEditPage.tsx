import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Copy, Folder, FolderPlus, Globe, ImagePlus, Lock, Save, Trash2, X } from 'lucide-react';
import { QuestionInput, type QuestionDto, type QuestionKind } from '@sq/shared';
import { errorText, uploadImage } from '@/lib/api';
import { cn } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/dom';
import { questionTextLength } from '@/game/QuestionBody';
import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/display';
import { ConfirmDialog } from '@/ui/Dialog';
import { Segmented, Select, TextArea, TextField } from '@/ui/fields';
import { useDeleteQuestion, useDuplicateQuestion, useQuestion, useQuestionGroups, useSaveQuestion } from '../api';
import { PageHeader } from '../components/common';
import { ChoiceEditor, HtmlToolbar, TagInput, newChoiceKey, type ChoiceDraft } from './editor-parts';
import { PhonePreview, StagePreview } from './QuestionPreview';
import { HtmlImportButton } from './HtmlImport';
import { GroupNameDialog } from './groups';

interface Draft {
  kind: QuestionKind;
  title: string;
  body: string;
  imageUrl: string | null;
  timeLimitSec: number | null;
  explanation: string;
  tags: string[];
  isPublic: boolean;
  groupId: number | null;
  choices: ChoiceDraft[];
}

const TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

function emptyDraft(groupId: number | null = null): Draft {
  return {
    kind: 'TEXT',
    title: '',
    body: '',
    imageUrl: null,
    timeLimitSec: null,
    explanation: '',
    tags: [],
    isPublic: false,
    groupId,
    choices: Array.from({ length: 4 }, (_, i) => ({ key: newChoiceKey(), text: '', isCorrect: i === 0 })),
  };
}

function fromDto(q: QuestionDto): Draft {
  return {
    kind: q.kind,
    title: q.title,
    body: q.body,
    imageUrl: q.imageUrl,
    timeLimitSec: q.timeLimitSec,
    explanation: q.explanation ?? '',
    tags: q.tags,
    isPublic: q.isPublic,
    groupId: q.groupId,
    choices: q.choices.map((c) => ({ key: newChoiceKey(), text: c.text, isCorrect: c.isCorrect })),
  };
}

function toInput(d: Draft) {
  return {
    kind: d.kind,
    title: d.title,
    body: d.body,
    imageUrl: d.imageUrl,
    timeLimitSec: d.timeLimitSec,
    explanation: d.explanation.trim() ? d.explanation : null,
    tags: d.tags,
    isPublic: d.isPublic,
    groupId: d.groupId,
    choices: d.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })),
  };
}

/** Back to the bank, with the question's group opened. */
const bankUrl = (groupId: number | null | undefined) => (groupId ? `/admin/questions?group=${groupId}` : '/admin/questions');

const fingerprint = (d: Draft) => JSON.stringify(toInput(d));

export default function QuestionEditPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const isNew = id === null;
  useDocumentTitle(isNew ? '새 문제' : '문제');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = useQuestion(id);
  const myGroups = useQuestionGroups({ scope: 'mine' });
  const [groupDialog, setGroupDialog] = useState(false);
  const save = useSaveQuestion();
  const dup = useDuplicateQuestion();
  const del = useDeleteQuestion();

  const [draft, setDraft] = useState<Draft>(() => {
    const g = Number(searchParams.get('group'));
    return emptyDraft(isNew && Number.isInteger(g) && g > 0 ? g : null);
  });
  const [initial, setInitial] = useState(() => fingerprint(draft));
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewMode, setPreviewMode] = useState<'mobile' | 'stage'>('mobile');
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const allowLeave = useRef(false);

  useEffect(() => {
    if (query.data && loadedId !== query.data.id) {
      const d = fromDto(query.data);
      setDraft(d);
      setInitial(fingerprint(d));
      setLoadedId(query.data.id);
    }
  }, [query.data, loadedId]);

  /** Someone else's public question: viewable and duplicable, never editable. */
  const readOnly = !isNew && query.data?.mine === false;
  const dirty = !readOnly && fingerprint(draft) !== initial;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !allowLeave.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (questionTextLength(draft.kind, draft.body) > 220) w.push('문제가 길어서 발표 화면에서 글자가 작아질 수 있어요. 220자 이내를 권장해요.');
    if (draft.choices.some((c) => [...c.text].length > 40)) w.push('40자가 넘는 보기가 있어서 휴대폰에서는 보기가 한 줄 목록으로 바뀌어요.');
    return w;
  }, [draft.kind, draft.body, draft.choices]);

  const submit = async () => {
    const parsed = QuestionInput.safeParse(toInput(draft));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const key = String(issue?.path[0] ?? 'form');
      setErrors({ [key]: issue?.message ?? '입력값을 확인해 주세요.' });
      toast.error(issue?.message ?? '입력값을 확인해 주세요.');
      setTab('edit');
      return;
    }
    try {
      const saved = await save.mutateAsync({ id, input: parsed.data });
      toast.success(isNew ? '문제를 만들었어요.' : '문제를 저장했어요.');
      allowLeave.current = true;
      navigate(bankUrl(saved.groupId));
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  if (!isNew && query.isPending) {
    return (
      <div className="flex justify-center py-24 text-n-400">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (!isNew && query.isError) {
    return (
      <div className="py-24 text-center">
        <p className="mb-4 text-lg font-bold">문제를 찾을 수 없어요.</p>
        <Link to="/admin/questions" className="font-bold text-info underline">
          문제은행으로 돌아가기
        </Link>
      </div>
    );
  }

  const preview = {
    kind: draft.kind,
    body: draft.body,
    imageUrl: draft.imageUrl,
    choices: draft.choices,
    timeLimitSec: draft.timeLimitSec,
  };

  return (
    <>
      <PageHeader
        back={
          <Link to={bankUrl(query.data?.groupId ?? draft.groupId)} className="inline-flex items-center gap-1 text-sm font-bold text-fg-muted hover:text-fg">
            <ArrowLeft className="size-4" /> 문제은행
          </Link>
        }
        title={isNew ? '새 문제 만들기' : readOnly ? '문제 보기' : '문제 수정'}
        actions={
          <>
            {!isNew && (
              <>
                <Button
                  variant="ghost"
                  icon={<Copy className="size-4" />}
                  loading={dup.isPending}
                  onClick={async () => {
                    try {
                      const q = await dup.mutateAsync(id!);
                      toast.success(readOnly ? '내 문제로 복제했어요. 복사본을 편집하고 있어요. (비공개)' : '복제했어요. 복사본을 편집하고 있어요.');
                      allowLeave.current = true;
                      navigate(`/admin/questions/${q.id}`);
                      allowLeave.current = false;
                    } catch (err) {
                      toast.error(errorText(err));
                    }
                  }}
                >
                  복제
                </Button>
                {!readOnly && (
                  <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
                    삭제
                  </Button>
                )}
              </>
            )}
            {!readOnly && (
              <Button icon={<Save className="size-5" />} loading={save.isPending} onClick={submit}>
                저장
              </Button>
            )}
          </>
        }
      />

      {readOnly && (
        <p className="mb-4 flex items-start gap-2 rounded-md bg-info-tint px-4 py-3 text-sm font-semibold text-info-dark">
          <Globe className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {query.data?.ownerName ?? '다른 관리자'}님이 공개한 문제예요. 수정할 수 없고, <b>복제</b>하면 내 문제(비공개)로 가져와 편집할 수 있어요.
          </span>
        </p>
      )}

      <Segmented
        label="편집 / 미리보기"
        className="mb-4 w-full lg:hidden"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'edit', label: '편집' },
          { value: 'preview', label: '미리보기' },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        <form
          className={cn('flex flex-col gap-6', tab !== 'edit' && 'hidden lg:flex')}
          inert={readOnly}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <section className="flex flex-col gap-5 rounded-lg bg-surface p-5 shadow-sm ring-1 ring-line/60 md:p-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">문제 형식</span>
              <Segmented
                label="문제 형식"
                value={draft.kind}
                onChange={(v) => set('kind', v)}
                options={[
                  { value: 'TEXT', label: '텍스트' },
                  { value: 'HTML', label: 'HTML' },
                ]}
              />
            </div>
            <TextField
              label="관리용 제목 (선택)"
              placeholder="목록에서 알아보기 쉬운 이름"
              maxLength={100}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              hint="참여자에게는 보이지 않아요."
            />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-end justify-between gap-2">
                <label htmlFor="question-body" className="text-sm font-bold">
                  문제
                </label>
                <div className="flex items-center gap-3">
                  {draft.kind === 'HTML' && !readOnly && (
                    <HtmlImportButton hasBody={!!draft.body.trim()} onApply={(html) => set('body', html)} />
                  )}
                  <span className="tabular text-xs font-semibold text-fg-muted">{questionTextLength(draft.kind, draft.body)}자</span>
                </div>
              </div>
              <div className="flex flex-col">
                {draft.kind === 'HTML' && <HtmlToolbar textareaRef={bodyRef} value={draft.body} onChange={(v) => set('body', v)} />}
                <TextArea
                  ref={bodyRef}
                  id="question-body"
                  mono={draft.kind === 'HTML'}
                  className={cn('min-h-36', draft.kind === 'HTML' && 'rounded-t-none')}
                  placeholder={draft.kind === 'HTML' ? '<p>HTML로 문제를 작성해요. <b>굵게</b>, <mark>강조</mark>도 쓸 수 있어요.</p>' : '문제를 입력해 주세요.'}
                  value={draft.body}
                  onChange={(e) => set('body', e.target.value)}
                  error={errors.body}
                  hint={
                    draft.kind === 'HTML'
                      ? '스크립트·링크·외부 이미지는 저장할 때 자동으로 제거돼요. CSS·이미지가 든 HTML 묶음은 "HTML 파일 불러오기"로 가져오세요.'
                      : undefined
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">문제 이미지 (선택)</span>
              {draft.imageUrl ? (
                <div className="relative w-fit">
                  <img src={draft.imageUrl} alt="문제 이미지 미리보기" className="max-h-48 rounded-md ring-1 ring-line" />
                  <button
                    type="button"
                    onClick={() => set('imageUrl', null)}
                    className="absolute -top-3 -right-3 flex size-9 items-center justify-center rounded-full bg-ink text-white shadow-md"
                    aria-label="이미지 삭제"
                  >
                    <X className="size-5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex h-24 items-center justify-center gap-2 rounded-md border-2 border-dashed border-n-300 font-bold text-fg-muted hover:border-n-400 hover:bg-n-25 disabled:opacity-60"
                >
                  {uploading ? <Spinner /> : <ImagePlus className="size-5" />}
                  이미지 올리기 (PNG·JPG·GIF·WebP)
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setUploading(true);
                  try {
                    const r = await uploadImage(file);
                    set('imageUrl', r.url);
                  } catch (err) {
                    toast.error(errorText(err));
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </div>
          </section>

          <section className="rounded-lg bg-surface p-5 shadow-sm ring-1 ring-line/60 md:p-6">
            <ChoiceEditor choices={draft.choices} onChange={(c) => set('choices', c)} error={errors.choices} />
          </section>

          <section className="grid gap-5 rounded-lg bg-surface p-5 shadow-sm ring-1 ring-line/60 md:p-6">
            {readOnly ? (
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  <Folder className="size-4" aria-hidden="true" /> 그룹
                </span>
                <p className="text-fg-muted">{query.data?.groupName ?? '없음'}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-end justify-between gap-2">
                  <label htmlFor="question-group" className="flex items-center gap-1.5 text-sm font-bold">
                    <Folder className="size-4" aria-hidden="true" /> 그룹
                  </label>
                  <button
                    type="button"
                    onClick={() => setGroupDialog(true)}
                    className="-my-1 inline-flex h-8 items-center gap-1 rounded-sm px-2 text-sm font-bold text-info-dark hover:bg-info-tint"
                  >
                    <FolderPlus className="size-4" aria-hidden="true" /> 새 그룹
                  </button>
                </div>
                <Select
                  id="question-group"
                  value={draft.groupId ?? ''}
                  onChange={(e) => set('groupId', e.target.value ? Number(e.target.value) : null)}
                  hint="비슷한 문제를 묶어 두면 목록이 간단해지고, 퀴즈방에 그룹째 넣을 수 있어요."
                >
                  <option value="">그룹 없음</option>
                  {draft.groupId !== null && myGroups.data && !myGroups.data.some((g) => g.id === draft.groupId) && (
                    <option value={draft.groupId}>{query.data?.groupName ?? '(알 수 없는 그룹)'}</option>
                  )}
                  {myGroups.data?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-sm font-bold">
                {draft.isPublic ? <Globe className="size-4" aria-hidden="true" /> : <Lock className="size-4" aria-hidden="true" />}
                공개 범위
              </span>
              <Segmented
                label="공개 범위"
                value={draft.isPublic ? 'public' : 'private'}
                onChange={(v) => set('isPublic', v === 'public')}
                options={[
                  { value: 'private', label: '비공개' },
                  { value: 'public', label: '공개' },
                ]}
              />
              <p className="text-xs font-semibold text-fg-muted">
                {draft.isPublic
                  ? '다른 관리자가 문제은행에서 보고 퀴즈방에 쓸 수 있어요. 수정은 나만 할 수 있어요.'
                  : '나만 볼 수 있어요. 다른 관리자의 문제은행과 퀴즈방 문제 선택에는 나타나지 않아요.'}
              </p>
            </div>
            <Select
              label="제한시간"
              value={draft.timeLimitSec ?? ''}
              onChange={(e) => set('timeLimitSec', e.target.value ? Number(e.target.value) : null)}
              hint="'방 기본값'이면 퀴즈방 설정의 기본 제한시간을 따라요."
            >
              <option value="">방 기본값</option>
              {TIME_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}초
                </option>
              ))}
            </Select>
            <TagInput tags={draft.tags} onChange={(t) => set('tags', t)} />
            <TextArea
              label="해설 (선택)"
              placeholder="정답 공개 후 화면에 함께 보여줄 설명"
              maxLength={500}
              className="min-h-20"
              value={draft.explanation}
              onChange={(e) => set('explanation', e.target.value)}
              counter={`${draft.explanation.length}/500`}
            />
          </section>

          {!readOnly && (
            <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
              <Button type="submit" size="lg" icon={<Save className="size-5" />} loading={save.isPending} className="shadow-lg">
                {isNew ? '문제 만들기' : '변경 내용 저장'}
              </Button>
            </div>
          )}
        </form>

        <aside
          className={cn(
            // never taller than the viewport while sticky, so the bottom of the preview stays reachable
            'flex min-w-0 flex-col gap-4 lg:sticky lg:top-8 lg:max-h-[calc(100dvh-4rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain',
            tab !== 'preview' && 'hidden lg:flex',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-extrabold">미리보기</h2>
            <Segmented
              label="미리보기 화면"
              className="shrink-0 [&_button]:whitespace-nowrap"
              value={previewMode}
              onChange={setPreviewMode}
              options={[
                { value: 'mobile', label: '휴대폰' },
                { value: 'stage', label: '발표 화면' },
              ]}
            />
          </div>
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 rounded-md bg-warning-tint px-3 py-2.5 text-sm font-semibold text-warning-text">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {w}
            </p>
          ))}
          <div className="rounded-lg bg-n-100 p-4">
            {previewMode === 'mobile' ? <PhonePreview q={preview} /> : <StagePreview q={preview} />}
          </div>
        </aside>
      </div>

      <GroupNameDialog open={groupDialog} onOpenChange={setGroupDialog} group={null} onSaved={(g) => set('groupId', g.id)} />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(v) => !v && blocker.state === 'blocked' && blocker.reset()}
        title="저장하지 않고 나갈까요?"
        description="작성 중인 내용이 사라져요."
        confirmLabel="나가기"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="이 문제를 삭제할까요?"
        description="이미 확정된 퀴즈방에는 영향이 없어요."
        confirmLabel="삭제"
        tone="danger"
        onConfirm={async () => {
          try {
            await del.mutateAsync(id!);
            toast.success('문제를 삭제했어요.');
            allowLeave.current = true;
            navigate(bankUrl(query.data?.groupId));
          } catch (err) {
            toast.error(errorText(err));
          }
        }}
      />
    </>
  );
}
