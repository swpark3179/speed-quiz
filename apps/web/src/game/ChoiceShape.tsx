import type { ChoiceShapeName } from '@/design/choices';

const PATHS: Record<ChoiceShapeName, React.ReactNode> = {
  circle: <circle cx="12" cy="12" r="8.6" />,
  triangle: <path d="M12 3.6 21 19.4H3z" />,
  square: <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="2.4" />,
  star: <path d="M12 2.9l2.75 5.75 6.3.78-4.62 4.37 1.17 6.27L12 17.04l-5.6 3.03 1.17-6.27L2.95 9.43l6.3-.78z" />,
  diamond: <path d="M12 2.6 21.4 12 12 21.4 2.6 12z" />,
  hexagon: <path d="M12 2.7l8.1 4.65v9.3L12 21.3l-8.1-4.65v-9.3z" />,
};

export function ChoiceShape({ shape, className, color = '#fff' }: { shape: ChoiceShapeName; className?: string; color?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={color}
      stroke={color}
      strokeWidth={1.6}
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[shape]}
    </svg>
  );
}
