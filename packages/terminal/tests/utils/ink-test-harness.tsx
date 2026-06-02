import React from 'react';
import { act } from 'react';
import { PassThrough, Writable } from 'node:stream';
import { render, renderToString } from '../../src/ui/ink';
import type { ReactNode } from 'react';
import type { Instance, RenderOptions } from 'ink';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type KeyModifiers = {
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
};

export type InkHarnessOptions = {
  width?: number;
  height?: number;
  debug?: boolean;
  interactive?: boolean;
};

type TtyInput = PassThrough & {
  isTTY: true;
  setRawMode: (enabled: boolean) => TtyInput;
  ref: () => TtyInput;
  unref: () => TtyInput;
};

class CaptureTtyOutput extends Writable {
  columns: number;
  rows: number;
  isTTY = true;
  readonly chunks: string[] = [];
  readonly frames: string[] = [];

  constructor(width: number, height: number) {
    super();
    this.columns = width;
    this.rows = height;
  }

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const value = String(chunk);
    this.chunks.push(value);

    const plain = normalizeInkFrame(value);
    if (plain.length > 0) {
      this.frames.push(plain);
    }

    callback();
  }

  resize(width: number, height: number): void {
    this.columns = width;
    this.rows = height;
    this.emit('resize');
  }

  rawOutput(): string {
    return this.chunks.join('');
  }

  lastFrame(): string {
    return this.frames.at(-1) ?? '';
  }
}

function createTtyInput(): TtyInput {
  const input = new PassThrough() as TtyInput;
  input.isTTY = true;
  input.setRawMode = () => input;
  input.ref = () => input;
  input.unref = () => input;
  return input;
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, '');
}

function normalizeInkFrame(value: string): string {
  return stripAnsi(value).replace(/\r/g, '');
}

function ctrlByte(input: string): string {
  if (input.length !== 1) return input;
  const code = input.toLowerCase().charCodeAt(0);
  if (code >= 97 && code <= 122) {
    return String.fromCharCode(code - 96);
  }
  if (input === '[') return '\x1b';
  if (input === ']') return '\x1d';
  return input;
}

function keySequence(key: string, modifiers: KeyModifiers = {}): string {
  const normalized = key.toLowerCase();

  if (modifiers.ctrl) {
    return ctrlByte(normalized);
  }

  switch (normalized) {
    case 'enter':
    case 'return':
      return '\r';
    case 'escape':
    case 'esc':
      return '\x1b';
    case 'tab':
      return '\t';
    case 'backspace':
      return '\x7f';
    case 'delete':
      return '\x1b[3~';
    case 'up':
      return '\x1b[A';
    case 'down':
      return '\x1b[B';
    case 'right':
      return '\x1b[C';
    case 'left':
      return '\x1b[D';
    case 'home':
      return '\x1b[H';
    case 'end':
      return '\x1b[F';
    case 'pageup':
      return '\x1b[5~';
    case 'pagedown':
      return '\x1b[6~';
    case 'space':
      return ' ';
    default:
      if (key.length === 1) {
        const printable = modifiers.shift ? key.toUpperCase() : key;
        return modifiers.meta ? `\x1b${printable}` : printable;
      }
      return key;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class InkTestHarness {
  readonly stdin: TtyInput;
  readonly stdout: CaptureTtyOutput;
  readonly stderr: CaptureTtyOutput;
  instance!: Instance;

  private constructor(options: InkHarnessOptions = {}) {
    const width = options.width ?? 80;
    const height = options.height ?? 24;
    this.stdin = createTtyInput();
    this.stdout = new CaptureTtyOutput(width, height);
    this.stderr = new CaptureTtyOutput(width, height);
  }

  static async create(node: ReactNode, options: InkHarnessOptions = {}): Promise<InkTestHarness> {
    const harness = new InkTestHarness(options);
    await act(async () => {
      harness.instance = render(node, {
        stdin: harness.stdin,
        stdout: harness.stdout,
        stderr: harness.stderr,
        debug: options.debug ?? true,
        interactive: options.interactive ?? true,
        exitOnCtrlC: false,
        patchConsole: false,
        kittyKeyboard: { mode: 'disabled' },
      } satisfies RenderOptions);
      await harness.instance.waitUntilRenderFlush();
    });
    return harness;
  }

  renderOptions(options: InkHarnessOptions = {}): RenderOptions {
    return {
      stdin: this.stdin,
      stdout: this.stdout,
      stderr: this.stderr,
      debug: options.debug ?? true,
      interactive: options.interactive ?? true,
      exitOnCtrlC: false,
      patchConsole: false,
      kittyKeyboard: { mode: 'disabled' },
    } satisfies RenderOptions;
  }

  async renderOnce(): Promise<void> {
    await act(async () => {
      await this.instance.waitUntilRenderFlush();
    });
  }

  async rerender(node: ReactNode): Promise<void> {
    await act(async () => {
      this.instance.rerender(node);
      await this.instance.waitUntilRenderFlush();
    });
  }

  captureFrame(): string {
    return this.stdout.lastFrame();
  }

  captureRawOutput(): string {
    return this.stdout.rawOutput();
  }

  captureFrames(): string[] {
    return [...this.stdout.frames];
  }

  typeText(value: string): void {
    act(() => {
      this.stdin.write(value);
    });
  }

  pasteText(value: string): void {
    act(() => {
      this.stdin.write(`\x1b[200~${value}\x1b[201~`);
    });
  }

  pressKey(key: string, modifiers: KeyModifiers = {}): void {
    act(() => {
      this.stdin.write(keySequence(key, modifiers));
    });
  }

  pressEnter(): void {
    this.pressKey('enter');
  }

  pressEscape(): void {
    this.pressKey('escape');
  }

  pressTab(): void {
    this.pressKey('tab');
  }

  pressUp(): void {
    this.pressKey('up');
  }

  pressDown(): void {
    this.pressKey('down');
  }

  resize(width: number, height: number): void {
    act(() => {
      this.stdout.resize(width, height);
      this.stderr.resize(width, height);
    });
  }

  async waitForText(text: string, timeoutMs = 600): Promise<string> {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      await this.renderOnce();
      const frame = this.captureFrame();
      if (frame.includes(text)) {
        return frame;
      }
      await delay(10);
    }

    throw new Error(`Timed out waiting for ${JSON.stringify(text)}. Last frame:\n${this.captureFrame()}`);
  }

  async cleanup(): Promise<void> {
    await act(async () => {
      this.instance.unmount();
      await this.instance.waitUntilExit().catch(() => undefined);
    });
    this.stdin.destroy();
    this.stdout.destroy();
    this.stderr.destroy();
  }
}

export async function renderInk(node: ReactNode, options?: InkHarnessOptions): Promise<InkTestHarness> {
  return InkTestHarness.create(node, options);
}

export function renderInkStatic(node: ReactNode, options: { columns?: number } = {}): string {
  let output = '';
  act(() => {
    output = renderToString(node, options);
  });
  return output;
}

export function stripInkAnsi(value: string): string {
  return stripAnsi(value);
}
