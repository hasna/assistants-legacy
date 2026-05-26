/**
 * Guard test for panel color-token adoption (plan 8d98da29 P2.2).
 *
 * Every panel's `fg={...}` color must resolve through the design-system token
 * system (themeColor()/color()), never a bare raw color word — otherwise it
 * won't adapt to the six themes (esp. daltonized/ansi from P1.2). This test
 * fails if a panel reintroduces a bare `fg={ ... 'cyan' ... }` literal.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const COMPONENTS = join(import.meta.dir, '..', 'src', 'components');
const COLOR_WORDS = '(cyan|green|red|yellow|blue|magenta|white|gray|grey)';

function panelFiles(): string[] {
  return readdirSync(COMPONENTS).filter((f) => f.endsWith('Panel.tsx'));
}

describe('panel color tokens (P2.2)', () => {
  test('no panel uses a bare color word in an fg={...} expression', () => {
    const offenders: string[] = [];
    // A bare color literal NOT immediately preceded by `themeColor(` / `color(`.
    const bare = new RegExp(`(?<!Color\\()(?<!\\bcolor\\()'${COLOR_WORDS}'`);
    for (const file of panelFiles()) {
      const text = readFileSync(join(COMPONENTS, file), 'utf-8');
      for (const line of text.split('\n')) {
        if (!line.includes('fg={')) continue;
        if (bare.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no panel uses a bare fg="colorword" attribute', () => {
    const offenders: string[] = [];
    const re = new RegExp(`fg="${COLOR_WORDS}"`);
    for (const file of panelFiles()) {
      const text = readFileSync(join(COMPONENTS, file), 'utf-8');
      if (re.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
