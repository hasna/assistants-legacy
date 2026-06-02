export type TerminalSelectOption<T = unknown> = {
  name: string;
  description: string;
  value?: T;
  disabled?: boolean;
};

export type TerminalInputValueRef = {
  value?: unknown;
};

export type TerminalThemeMode = 'dark' | 'light';

export type TerminalRendererHandle = {
  isDestroyed?: boolean;
  destroy: () => void;
  themeMode?: TerminalThemeMode | null;
  on: (event: 'destroy' | 'theme_mode', handler: (...args: any[]) => void) => void;
};

export type TerminalKeyEvent = {
  name: string;
  sequence?: string;
  ctrl: boolean;
  shift: boolean;
  meta?: boolean;
  option?: boolean;
  eventType?: string;
};
