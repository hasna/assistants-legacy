/**
 * ANSI-aware slice shim (plan 8d98da29 P0.2) — re-exports the stable npm
 * `slice-ansi` (same (string, start, end?) signature the ink fork expects).
 */
import sliceAnsi from 'slice-ansi';
export default sliceAnsi;
