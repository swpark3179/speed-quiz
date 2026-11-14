import { create } from 'zustand';

interface Prefs {
  sound: boolean;
  volume: number;
  haptics: boolean;
  reduceMotion: boolean;
  stageTheme: 'light' | 'stage';
  /** phone: mini ranking strip expanded */
  standingsOpen: boolean;
  set: (p: Partial<Omit<Prefs, 'set'>>) => void;
}

const KEY = 'sq.prefs';

function load(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

export const usePrefs = create<Prefs>((set, get) => ({
  sound: true,
  volume: 0.7,
  haptics: true,
  reduceMotion: false,
  stageTheme: 'light',
  standingsOpen: true,
  ...load(),
  set: (p) => {
    set(p);
    const { set: _s, ...rest } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* private mode */
    }
  },
}));
