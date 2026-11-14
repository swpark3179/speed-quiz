export type ChoiceShapeName = 'circle' | 'triangle' | 'square' | 'star' | 'diamond' | 'hexagon';

export interface ChoiceMeta {
  index: number;
  number: number;
  name: string;
  shape: ChoiceShapeName;
  shapeLabel: string;
  /** CSS custom property references (from tokens) */
  base: string;
  edge: string;
  tint: string;
  hex: string;
}

const RAW: [string, ChoiceShapeName, string, string][] = [
  ['토마토', 'circle', '동그라미', '#D92D20'],
  ['블루', 'triangle', '세모', '#1F5FE0'],
  ['바이올렛', 'square', '네모', '#7B3FE4'],
  ['그린', 'star', '별', '#108548'],
  ['오렌지', 'diamond', '마름모', '#C74B0A'],
  ['마젠타', 'hexagon', '육각형', '#CB2A85'],
];

export const CHOICES: ChoiceMeta[] = RAW.map(([name, shape, shapeLabel, hex], i) => ({
  index: i,
  number: i + 1,
  name,
  shape,
  shapeLabel,
  base: `var(--color-c${i + 1})`,
  edge: `var(--color-c${i + 1}-edge)`,
  tint: `var(--color-c${i + 1}-tint)`,
  hex,
}));

export function choiceMeta(position: number): ChoiceMeta {
  return CHOICES[((position % CHOICES.length) + CHOICES.length) % CHOICES.length]!;
}

export function choiceLabel(position: number): string {
  const m = choiceMeta(position);
  return `${m.number}번 ${m.shapeLabel}`;
}

export const CONFETTI_COLORS = ['#FFC233', '#D92D20', '#1F5FE0', '#7B3FE4', '#108548', '#C74B0A', '#CB2A85'];
