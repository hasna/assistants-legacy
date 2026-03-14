import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SubagentAuditLog } from '../src/agents/audit-log';
import type { SubagentLogEntry } from '../src/agents/audit-log';

let tempDir: string;
let logDir: string;
let audit: SubagentAuditLog;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'audit-log-test-'));
  logDir = join(tempDir, 'audit-logs');
  audit = new SubagentAuditLog(logDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeEntry(overrides: Partial<SubagentLogEntry> = {}): SubagentLogEntry {
  return {
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    agentName: 'test-agent',
    prompt: 'Do something useful',
    result: 'Done successfully',
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 150,
    turnCount: 3,
    ...overrides,
  };
}

// ─── log / query ──────────────────────────────────────────────────────────────

describe('log / query', () => {
  test('logs an entry and retrieves it via query', () => {
    const entry = makeEntry({ agentName: 'my-agent' });
    audit.log(entry);
    const results = audit.query();
    expect(results.some(r => r.id === entry.id)).toBe(true);
  });

  test('query returns empty array when no logs', () => {
    expect(audit.query()).toHaveLength(0);
  });

  test('logs multiple entries', () => {
    audit.log(makeEntry());
    audit.log(makeEntry());
    audit.log(makeEntry());
    const results = audit.query({ limit: 10 });
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  test('query respects limit', () => {
    for (let i = 0; i < 5; i++) audit.log(makeEntry());
    const results = audit.query({ limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test('query returns all entries without filter', () => {
    audit.log(makeEntry({ agentName: 'agent-A' }));
    audit.log(makeEntry({ agentName: 'agent-B' }));
    audit.log(makeEntry({ agentName: 'agent-A' }));

    const results = audit.query();
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.some(r => r.agentName === 'agent-A')).toBe(true);
    expect(results.some(r => r.agentName === 'agent-B')).toBe(true);
  });

  test('query filters by status', () => {
    audit.log(makeEntry({ status: 'success' }));
    audit.log(makeEntry({ status: 'failed', result: 'Failed!' }));

    const failed = audit.query({ status: 'failed' });
    expect(failed.every(r => r.status === 'failed')).toBe(true);
  });

  test('log truncates very long results', () => {
    const longResult = 'x'.repeat(20_000);
    audit.log(makeEntry({ result: longResult }));
    const results = audit.query();
    expect(results.length).toBeGreaterThan(0);
    // The result should be truncated
    if (results[0].result) {
      expect(results[0].result.length).toBeLessThan(20_000);
    }
  });
});

// ─── getEntry ─────────────────────────────────────────────────────────────────

describe('getEntry', () => {
  test('returns entry by ID', () => {
    const entry = makeEntry({ agentName: 'lookup-agent' });
    audit.log(entry);
    const found = audit.getEntry(entry.id);
    expect(found?.agentName).toBe('lookup-agent');
  });

  test('returns null for unknown ID', () => {
    expect(audit.getEntry('no-such-id')).toBeNull();
  });
});

// ─── getLogDir ────────────────────────────────────────────────────────────────

describe('getLogDir', () => {
  test('returns the configured log directory', () => {
    expect(audit.getLogDir()).toBe(logDir);
  });
});
