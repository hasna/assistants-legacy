/**
 * Smoke test for the Yoga layout shim (plan 8d98da29 P0.2).
 *
 * Proves the vendored ink fork's layout backend resolves to the official
 * yoga-layout (WASM) and actually computes flexbox layout — the dependency that
 * was the standing blocker for booting the forked renderer.
 */
import { describe, expect, test } from 'bun:test';
import Yoga, { FlexDirection, Edge, Align, Justify } from '../src/native-ts/yoga-layout';

describe('yoga-layout shim', () => {
  test('exports the Yoga instance and the YGEnums the ink fork imports', () => {
    expect(typeof Yoga.Node?.create).toBe('function');
    // Enums used by src/ink/layout/yoga.ts.
    expect(typeof FlexDirection.Row).toBe('number');
    expect(typeof Edge.All).toBe('number');
    expect(typeof Align.Center).toBe('number');
    expect(typeof Justify.SpaceBetween).toBe('number');
  });

  test('computes a row flex layout (two children split a 100-wide parent)', () => {
    const root = Yoga.Node.create();
    root.setFlexDirection(FlexDirection.Row);
    root.setWidth(100);
    root.setHeight(10);

    const a = Yoga.Node.create();
    a.setFlexGrow(1);
    const b = Yoga.Node.create();
    b.setFlexGrow(1);
    root.insertChild(a, 0);
    root.insertChild(b, 1);

    root.calculateLayout(100, 10);

    expect(root.getComputedWidth()).toBe(100);
    expect(a.getComputedWidth()).toBe(50);
    expect(b.getComputedWidth()).toBe(50);
    expect(b.getComputedLeft()).toBe(50);

    root.freeRecursive();
  });
});
