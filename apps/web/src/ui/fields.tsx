import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Switch as RSwitch } from 'radix-ui';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/format';

const inputBase =
  'w-full rounded-md border-2 border-n-400/70 bg-surface px-4 text-base text-fg placeholder:text-n-400 transition-colors outline-none hover:border-n-500 focus:border-info focus:ring-4 focus:ring-info/15 disabled:bg-n-50 disabled:text-n-500 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15';

interface FieldShellProps {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  counter?: string;
  children: ReactNode;
  className?: string;
}

export function FieldShell({ id, label, hint, error, counter, children, className }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || counter) && (
        <div className="flex items-end justify-between gap-2">
          {label && (
            <label htmlFor={id} className="text-sm font-bold text-fg">
              {label}
            </label>
          )}
          {counter && <span className="tabular text-xs font-semibold text-fg-muted">{counter}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="flex items-center gap-1 text-sm font-semibold text-danger-text">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  counter?: string;
  inputSize?: 'md' | 'lg';
  wrapperClassName?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, counter, inputSize = 'md', className, wrapperClassName, id: idProp, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} counter={counter} className={wrapperClassName}>
      <input
        ref={ref}
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={cn(inputBase, inputSize === 'lg' ? 'h-14 text-lg font-semibold' : 'h-12', className)}
        {...rest}
      />
    </FieldShell>
  );
});

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  counter?: string;
  mono?: boolean;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, counter, className, mono, id: idProp, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} counter={counter}>
      <textarea
        ref={ref}
        id={id}
        aria-invalid={!!error || undefined}
        className={cn(inputBase, 'min-h-28 py-3 leading-relaxed', mono && 'font-mono text-sm', className)}
        {...rest}
      />
    </FieldShell>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; error?: string | null };

export function Select({ label, hint, error, className, id: idProp, children, ...rest }: SelectProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className={cn(
          inputBase,
          "h-12 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236B6690%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:20px] bg-[right_12px_center] bg-no-repeat pr-10",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <label htmlFor={id} className="flex flex-col gap-0.5">
        <span className="font-bold">{label}</span>
        {description && <span className="text-sm text-fg-muted">{description}</span>}
      </label>
      <RSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="relative mt-0.5 inline-flex h-8 w-14 shrink-0 items-center rounded-full bg-n-300 transition-colors data-[state=checked]:bg-success disabled:opacity-50"
      >
        <RSwitch.Thumb className="block size-6 translate-x-1 rounded-full bg-white shadow-md transition-transform duration-200 ease-[var(--ease-overshoot)] data-[state=checked]:translate-x-7" />
      </RSwitch.Root>
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  id: idProp,
}: {
  label?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: ReactNode;
  id?: string;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <div className="flex h-12 items-stretch overflow-hidden rounded-md border-2 border-n-400/70 bg-surface focus-within:border-info focus-within:ring-4 focus-within:ring-info/15">
        <button
          type="button"
          className="w-12 text-xl font-bold text-fg-muted hover:bg-n-50 disabled:opacity-30"
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          aria-label="줄이기"
        >
          −
        </button>
        <div className="flex flex-1 items-center justify-center gap-1">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            className="tabular w-full min-w-0 bg-transparent text-center text-lg font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(n);
            }}
            onBlur={() => onChange(clamp(value))}
          />
          {suffix && <span className="pr-2 text-sm font-semibold text-fg-muted">{suffix}</span>}
        </div>
        <button
          type="button"
          className="w-12 text-xl font-bold text-fg-muted hover:bg-n-50 disabled:opacity-30"
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          aria-label="늘리기"
        >
          +
        </button>
      </div>
    </FieldShell>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-md bg-n-100 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-sm px-4 text-sm font-bold transition-all',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 select-none', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 cursor-pointer rounded-xs accent-[#17153B]"
      />
      <span>{label}</span>
    </label>
  );
}
