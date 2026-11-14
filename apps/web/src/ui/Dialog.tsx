import { useState, type ReactNode } from 'react';
import { Dialog as RDialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/format';
import { Button } from './Button';

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-(--z-modal) bg-ink/50 data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
        <RDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-(--z-modal) flex max-h-[min(90dvh,860px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-surface shadow-lg outline-none data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in',
            size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-3xl' : 'max-w-lg',
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div>
              <RDialog.Title className="text-xl font-extrabold">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-fg-muted">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">대화 상자</RDialog.Description>
              )}
            </div>
            <RDialog.Close className="-mt-1 -mr-2 inline-flex size-10 items-center justify-center rounded-sm text-fg-muted hover:bg-n-100" aria-label="닫기">
              <X className="size-5" />
            </RDialog.Close>
          </div>
          {children && <div className="min-h-0 overflow-y-auto px-6 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Promise-free confirm dialog; render it with state from the caller. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '확인',
  tone = 'primary',
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
