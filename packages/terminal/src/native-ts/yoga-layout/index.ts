/**
 * Yoga layout shim (plan 8d98da29 P0.2).
 *
 * The vendored takumi Ink fork (src/ink/layout/yoga.ts) imports its Yoga backend
 * from `src/native-ts/yoga-layout`. Takumi shipped its own native-ts build of
 * Yoga; here we satisfy the same contract with the official `yoga-layout` npm
 * package (v3, WASM with the binary inlined as base64 — pure JS, bundles via
 * Bun, no separate .wasm asset). The exported surface (default `Yoga` instance
 * + the YGEnums: Align, Direction, Display, Edge, FlexDirection, Gutter, Justify,
 * MeasureMode, Overflow, PositionType, Wrap + the `Node` type) is identical, so
 * the fork compiles and runs against it unchanged.
 */
export { default } from 'yoga-layout';
export * from 'yoga-layout';
