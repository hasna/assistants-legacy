/**
 * Grapheme segmenter shim (plan 8d98da29 P0.2) — the ink fork only needs
 * getGraphemeSegmenter() for width/wrap calculations; Intl.Segmenter is built in.
 */
let segmenter: Intl.Segmenter | undefined;
export function getGraphemeSegmenter(): Intl.Segmenter {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return segmenter;
}
