import { describe, test, expect, beforeEach } from 'bun:test';
import { PreferenceLearner } from '../src/memory/preference-learner';

let learner: PreferenceLearner;

beforeEach(() => {
  learner = new PreferenceLearner(3); // threshold = 3
});

// ─── observe ─────────────────────────────────────────────────────────────────

describe('observe', () => {
  test('records a pattern on first observation', () => {
    learner.observe({ type: 'tool_param', key: 'Read.encoding', value: 'utf-8' });
    const patterns = learner.getPatterns();
    expect(patterns.some(p => p.value === 'utf-8')).toBe(true);
  });

  test('increments count on repeated observation', () => {
    const event = { type: 'tool_param', key: 'Write.format', value: 'json' };
    learner.observe(event);
    learner.observe(event);
    learner.observe(event);
    const patterns = learner.getPatterns();
    const p = patterns.find(p => p.value === 'json');
    expect(p?.count).toBe(3);
  });

  test('tracks distinct patterns separately', () => {
    learner.observe({ type: 'tool_param', key: 'k', value: 'a' });
    learner.observe({ type: 'tool_param', key: 'k', value: 'b' });
    const patterns = learner.getPatterns();
    expect(patterns.some(p => p.value === 'a')).toBe(true);
    expect(patterns.some(p => p.value === 'b')).toBe(true);
  });
});

// ─── observeToolCall ──────────────────────────────────────────────────────────

describe('observeToolCall', () => {
  test('records all string/boolean/number params', () => {
    learner.observeToolCall('Read', { path: '/tmp/test.ts', encoding: 'utf-8', binary: false });
    const patterns = learner.getPatterns();
    expect(patterns.some(p => p.key.includes('Read.path'))).toBe(true);
    expect(patterns.some(p => p.key.includes('Read.encoding'))).toBe(true);
    expect(patterns.some(p => p.key.includes('Read.binary'))).toBe(true);
  });

  test('ignores object/array params', () => {
    learner.observeToolCall('Bash', { cmd: 'ls', env: { PATH: '/usr/bin' } });
    const patterns = learner.getPatterns();
    expect(patterns.some(p => p.key.includes('Bash.cmd'))).toBe(true);
    // env is object — should be ignored
    expect(patterns.some(p => p.key.includes('Bash.env'))).toBe(false);
  });
});

// ─── observeFileCreation ──────────────────────────────────────────────────────

describe('observeFileCreation', () => {
  test('records file extension as preference', () => {
    learner.observeFileCreation('src/index.ts');
    const patterns = learner.getPatterns();
    expect(patterns.some(p => p.value === 'ts')).toBe(true);
  });

  test('records multiple file extensions', () => {
    learner.observeFileCreation('a.ts');
    learner.observeFileCreation('b.tsx');
    const patterns = learner.getPatterns();
    expect(patterns.some(p => p.value === 'ts')).toBe(true);
    expect(patterns.some(p => p.value === 'tsx')).toBe(true);
  });

  test('ignores files without extension', () => {
    // file without extension — should not crash
    expect(() => learner.observeFileCreation('Makefile')).not.toThrow();
  });
});

// ─── observeCorrection ───────────────────────────────────────────────────────

describe('observeCorrection', () => {
  test('records a correction pattern', () => {
    learner.observeCorrection('camelCase', 'snake_case');
    const patterns = learner.getPatterns();
    expect(patterns.some(p => p.value === 'snake_case')).toBe(true);
  });
});

// ─── getPatterns ──────────────────────────────────────────────────────────────

describe('getPatterns', () => {
  test('returns empty array initially', () => {
    expect(learner.getPatterns()).toHaveLength(0);
  });

  test('returns all observed patterns', () => {
    learner.observe({ type: 'tool_param', key: 'k1', value: 'v1' });
    learner.observe({ type: 'file_type', key: 'ext', value: 'ts' });
    expect(learner.getPatterns()).toHaveLength(2);
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe('clear', () => {
  test('removes all patterns', () => {
    learner.observe({ type: 'tool_param', key: 'k', value: 'v' });
    learner.clear();
    expect(learner.getPatterns()).toHaveLength(0);
  });

  test('allows re-recording after clear', () => {
    const event = { type: 'tool_param', key: 'k', value: 'v' };
    learner.observe(event);
    learner.observe(event);
    learner.observe(event);
    learner.clear();
    learner.observe(event);
    const p = learner.getPatterns().find(x => x.value === 'v');
    expect(p?.count).toBe(1); // starts fresh
  });
});

// ─── threshold behavior ───────────────────────────────────────────────────────

describe('threshold', () => {
  test('default threshold is 3 (from constructor)', () => {
    // Pattern appears 2 times — below threshold of 3
    const event = { type: 'tool_param', key: 'k', value: 'v' };
    learner.observe(event);
    learner.observe(event);
    // Patterns are tracked regardless of threshold
    expect(learner.getPatterns().find(p => p.value === 'v')?.count).toBe(2);
  });
});
