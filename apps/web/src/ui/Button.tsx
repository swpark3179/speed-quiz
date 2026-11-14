import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { Spinner } from './display';

/**
 * "Arcade key" button: the outer element is the key's darker edge, the inner face sits 4–6px above it
 * and travels down on press (transform only — cheap on low-end phones).
 */
const button = tv({
  slots: {
    root: 'group relative inline-flex shrink-0 select-none no-tap rounded-md align-middle outline-none transition-[filter,opacity] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-info',
    face: 'inline-flex w-full items-center justify-center gap-2 rounded-md font-bold whitespace-nowrap transition-transform duration-75 ease-out',
  },
  variants: {
    variant: {
      primary: { root: 'bg-spark-600 mt-1', face: 'bg-spark-400 text-ink group-hover:bg-spark-300' },
      ink: { root: 'bg-black mt-1', face: 'bg-ink text-white group-hover:bg-n-800' },
      danger: { root: 'bg-danger-dark mt-1', face: 'bg-danger text-white group-hover:brightness-110' },
      success: { root: 'bg-success-dark mt-1', face: 'bg-success text-white group-hover:brightness-110' },
      secondary: { root: 'bg-transparent', face: 'border-2 border-ink bg-surface text-ink group-hover:bg-n-50' },
      ghost: { root: 'bg-transparent', face: 'text-fg group-hover:bg-n-100 stage:group-hover:bg-stage-700' },
      subtle: { root: 'bg-transparent', face: 'bg-n-100 text-ink group-hover:bg-n-200' },
    },
    size: {
      sm: { face: 'h-9 px-3 text-sm', root: 'rounded-sm' },
      md: { face: 'h-12 px-5 text-base' },
      lg: { face: 'h-14 px-6 text-lg' },
      xl: { face: 'h-16 px-8 text-xl', root: 'rounded-lg' },
    },
    block: { true: { root: 'flex w-full' } },
    keyed: { true: {} },
  },
  compoundVariants: [
    { keyed: true, class: { face: '-translate-y-1 group-active:translate-y-0 group-disabled:translate-y-0' } },
    { keyed: true, size: 'xl', class: { face: '-translate-y-1.5 group-active:-translate-y-0.5' } },
    { size: 'sm', class: { face: 'rounded-sm' } },
    { size: 'xl', class: { face: 'rounded-lg' } },
  ],
  defaultVariants: { variant: 'primary', size: 'md' },
});

type ButtonVariants = VariantProps<typeof button>;

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>, Omit<ButtonVariants, 'keyed'> {
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size, block, loading, icon, children, className, disabled, type = 'button', ...rest },
  ref,
) {
  const keyed = variant === 'primary' || variant === 'ink' || variant === 'danger' || variant === 'success';
  const s = button({ variant, size, block, keyed });
  return (
    <button ref={ref} type={type} className={s.root({ className })} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      <span className={s.face()}>
        {loading ? <Spinner className="size-5" /> : icon}
        {children}
      </span>
    </button>
  );
});

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-10 items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-n-100 hover:text-fg disabled:opacity-40 stage:hover:bg-stage-700 ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
