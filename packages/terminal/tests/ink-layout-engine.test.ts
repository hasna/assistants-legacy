/**
 * Proves the vendored takumi Ink fork's LAYOUT ENGINE boots and computes flexbox
 * layout on the official WASM Yoga backend (plan 8d98da29 P0.2).
 *
 * This is the fork's own layout subsystem (src/ink/layout — engine + node + the
 * Yoga wrapper), self-contained with no takumi app-internal deps, exercised
 * end-to-end: build a node tree, calculate layout, read computed geometry. It
 * demonstrates the forked renderer's core works here, with the Yoga blocker that
 * the P0.1 spike called "multi-week native build" removed.
 */
import { describe, expect, test } from 'bun:test';
import { createLayoutNode } from '../src/ink/layout/engine';
import { LayoutFlexDirection, LayoutEdge } from '../src/ink/layout/node';

describe('ink fork layout engine on WASM Yoga', () => {
  test('createLayoutNode builds a tree and computes a row split', () => {
    const root = createLayoutNode();
    root.setFlexDirection(LayoutFlexDirection.Row);
    root.setWidth(120);
    root.setHeight(8);

    const left = createLayoutNode();
    left.setFlexGrow(1);
    const right = createLayoutNode();
    right.setFlexGrow(1);
    root.insertChild(left, 0);
    root.insertChild(right, 1);

    root.calculateLayout(120, 8);

    expect(root.getComputedWidth()).toBe(120);
    expect(left.getComputedWidth()).toBe(60);
    expect(right.getComputedWidth()).toBe(60);
    expect(right.getComputedLeft()).toBe(60);
    expect(root.getComputedHeight()).toBe(8);
  });

  test('column layout with fixed-height children stacks vertically', () => {
    const root = createLayoutNode();
    root.setFlexDirection(LayoutFlexDirection.Column);
    root.setWidth(40);
    root.setHeight(10);

    const a = createLayoutNode();
    a.setHeight(3);
    const b = createLayoutNode();
    b.setHeight(4);
    root.insertChild(a, 0);
    root.insertChild(b, 1);

    root.calculateLayout(40, 10);

    expect(a.getComputedTop()).toBe(0);
    expect(a.getComputedHeight()).toBe(3);
    expect(b.getComputedTop()).toBe(3);
    expect(b.getComputedHeight()).toBe(4);
  });

  test('padding is reflected in computed edges', () => {
    const root = createLayoutNode();
    root.setWidth(50);
    root.setHeight(10);
    root.setPadding(LayoutEdge.Left, 4);

    const child = createLayoutNode();
    child.setFlexGrow(1);
    root.insertChild(child, 0);
    root.calculateLayout(50, 10);

    expect(root.getComputedPadding(LayoutEdge.Left)).toBe(4);
    expect(child.getComputedLeft()).toBe(4);
  });
});
