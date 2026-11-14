import { useRef, useState } from 'react';
import { CheckCircle2, FileUp, FolderOpen, Info, ShieldAlert, Upload } from 'lucide-react';
import { HTML_BODY_MAX } from '@sq/shared';
import { uploadImage } from '@/lib/api';
import { cn } from '@/lib/format';
import { sanitizeHtml } from '@/lib/sanitize';
import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/display';
import { Modal } from '@/ui/Dialog';
import { describeDrops, filesFromSelection, importHtmlBundle, type ImportReport } from './html-import';

const ACCEPT = '.html,.htm,.css,.zip,image/png,image/jpeg,image/gif,image/webp';

/**
 * "HTML 파일 불러오기": turns an index.html + css + images bundle (files, folder or zip) into the
 * sanitized single-fragment body. JS is never run or kept.
 */
export function HtmlImportButton({ hasBody, onApply }: { hasBody: boolean; onApply: (html: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<{ html: string; report: ImportReport } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setResult(null);
    setError(null);
    setBusy(false);
  };
  const close = (v: boolean) => {
    if (!v) reset();
    setOpen(v);
  };

  const run = async (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const files = await filesFromSelection(Array.from(list));
      setResult(await importHtmlBundle(files, { upload: uploadImage, sanitize: sanitizeHtml }));
    } catch (err) {
      setError((err as Error).message || '파일을 읽지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const drops = result ? describeDrops(result.report) : [];
  const canApply = !!result && !result.report.tooLong && result.html.length > 0;

  return (
    <>
      <Button size="sm" variant="subtle" icon={<FileUp className="size-4" />} onClick={() => setOpen(true)}>
        HTML 파일 불러오기
      </Button>
      <Modal
        open={open}
        onOpenChange={close}
        size="lg"
        title="HTML 파일 불러오기"
        description="index.html과 CSS·이미지를 함께 불러와 문제 본문으로 바꿔요. 스크립트(JS)는 실행하지 않고 제거해요."
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              취소
            </Button>
            {result && (
              <Button variant="ghost" onClick={reset}>
                다른 파일 고르기
              </Button>
            )}
            <Button
              disabled={!canApply}
              icon={<CheckCircle2 className="size-5" />}
              onClick={() => {
                if (!result) return;
                onApply(result.html);
                close(false);
              }}
            >
              {hasBody ? '본문 바꾸기' : '본문에 넣기'}
            </Button>
          </>
        }
      >
        {!result ? (
          <div className="flex flex-col gap-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void run(e.dataTransfer.files);
              }}
              className={cn(
                'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
                drag ? 'border-info bg-info-tint' : 'border-n-300 bg-n-50',
              )}
            >
              {busy ? (
                <>
                  <Spinner className="size-8 text-info" />
                  <p className="font-semibold text-fg-muted">파일을 변환하고 이미지를 올리는 중이에요…</p>
                </>
              ) : (
                <>
                  <Upload className="size-8 text-n-400" aria-hidden="true" />
                  <p className="font-bold">파일을 여기에 끌어다 놓거나 골라 주세요</p>
                  <p className="text-sm text-fg-muted">.html + .css + 이미지(PNG·JPG·GIF·WebP) 여러 개, 폴더, 또는 .zip 묶음</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" icon={<FileUp className="size-4" />} onClick={() => filesRef.current?.click()}>
                      파일·ZIP 선택
                    </Button>
                    <Button size="sm" variant="secondary" icon={<FolderOpen className="size-4" />} onClick={() => folderRef.current?.click()}>
                      폴더 선택
                    </Button>
                  </div>
                </>
              )}
            </div>
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-tint px-3 py-2.5 text-sm font-semibold text-danger-text">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
            <div className="flex items-start gap-2 rounded-md bg-n-100 px-3 py-2.5 text-sm text-fg-muted">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                CSS는 허용된 글자·표·여백 스타일만 각 요소에 옮겨져요. 위치 고정(position), 애니메이션, 배경 이미지, 웹폰트, @media와 :hover 같은 규칙은
                빠져요. 이미지는 문제 이미지처럼 서버에 올라가고, 외부 주소의 이미지·CSS는 불러오지 않아요.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <li className="rounded-md bg-n-50 px-3 py-2">
                <p className="text-fg-muted">불러온 파일</p>
                <p className="truncate font-bold" title={result.report.entry}>
                  {result.report.entry}
                </p>
              </li>
              <li className="rounded-md bg-n-50 px-3 py-2">
                <p className="text-fg-muted">올린 이미지</p>
                <p className="tabular font-bold">{result.report.imagesUploaded}개</p>
              </li>
              <li className="rounded-md bg-n-50 px-3 py-2">
                <p className="text-fg-muted">스타일 적용한 요소</p>
                <p className="tabular font-bold">{result.report.stylesApplied}개</p>
              </li>
            </ul>
            {drops.length > 0 ? (
              <div className="rounded-md bg-warning-tint px-4 py-3 text-sm text-warning-text">
                <p className="mb-1 font-bold">안전을 위해 빼고 가져왔어요</p>
                <ul className="list-disc pl-5 font-semibold">
                  {drops.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-md bg-success-tint px-3 py-2.5 text-sm font-semibold text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" /> 빠진 내용 없이 모두 가져왔어요.
              </p>
            )}
            {result.report.tooLong && (
              <p role="alert" className="rounded-md bg-danger-tint px-3 py-2.5 text-sm font-semibold text-danger-text">
                변환한 본문이 너무 길어요 ({result.report.length.toLocaleString()}자 / 최대 {HTML_BODY_MAX.toLocaleString()}자). 내용을 나눠서
                불러와 주세요.
              </p>
            )}
            {!result.html && (
              <p role="alert" className="rounded-md bg-danger-tint px-3 py-2.5 text-sm font-semibold text-danger-text">
                가져올 수 있는 내용이 없어요.
              </p>
            )}
            {hasBody && canApply && <p className="text-sm font-semibold text-fg-muted">지금 작성 중인 문제 본문은 불러온 내용으로 바뀌어요.</p>}
            <details className="rounded-md ring-1 ring-line">
              <summary className="cursor-pointer px-3 py-2 text-sm font-bold">변환된 HTML 보기</summary>
              <pre className="max-h-60 overflow-auto border-t border-line bg-n-50 px-3 py-2 font-mono text-xs whitespace-pre-wrap">{result.html}</pre>
            </details>
          </div>
        )}
        <input
          ref={filesRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            void run(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(e) => {
            void run(e.target.files);
            e.target.value = '';
          }}
        />
      </Modal>
    </>
  );
}
