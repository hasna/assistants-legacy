import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import { closeDatabase, resetDatabaseSingleton, getDatabase } from '../src/database';
import { InterviewStore } from '../src/interviews/store';
import type { InterviewQuestion } from '@hasna/assistants-shared';

if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let store: InterviewStore;
let origDir: string | undefined;

beforeEach(() => {
  origDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'interview-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
  closeDatabase();
  resetDatabaseSingleton();
  store = new InterviewStore(getDatabase());
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (origDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origDir;
  rmSync(tempDir, { recursive: true, force: true });
});

const questions: InterviewQuestion[] = [
  { id: 'q1', text: 'What is your name?', type: 'text' },
  { id: 'q2', text: 'What is your goal?', type: 'text' },
];

function makeRecord(overrides = {}) {
  return {
    id: `iv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    sessionId: 'sess-001',
    title: 'Onboarding',
    questions,
    ...overrides,
  };
}

// ─── create / get ─────────────────────────────────────────────────────────────

describe('create / get', () => {
  test('creates an interview record', () => {
    const rec = store.create(makeRecord());
    expect(rec.id).toBeDefined();
    expect(rec.status).toBe('pending');
    expect(rec.answers).toEqual({});
  });

  test('get returns created record', () => {
    const rec = store.create(makeRecord());
    const found = store.get(rec.id);
    expect(found?.id).toBe(rec.id);
    expect(found?.title).toBe('Onboarding');
  });

  test('get returns undefined for unknown', () => {
    expect(store.get('ghost')).toBeUndefined();
  });

  test('questions are persisted', () => {
    const rec = store.create(makeRecord());
    const found = store.get(rec.id);
    expect(found?.questions).toHaveLength(2);
    expect(found?.questions[0].id).toBe('q1');
  });
});

// ─── updateAnswers / complete / cancel ───────────────────────────────────────

describe('updateAnswers / complete / cancel', () => {
  test('updateAnswers stores answers', () => {
    const rec = store.create(makeRecord());
    store.updateAnswers(rec.id, { q1: 'Alice', q2: 'Build something' });
    const found = store.get(rec.id);
    expect(found?.answers.q1).toBe('Alice');
    expect(found?.answers.q2).toBe('Build something');
  });

  test('complete sets status to completed', () => {
    const rec = store.create(makeRecord());
    store.complete(rec.id, { q1: 'Final answer' });
    const found = store.get(rec.id);
    expect(found?.status).toBe('completed');
    expect(found?.answers.q1).toBe('Final answer');
  });

  test('cancel sets status to cancelled', () => {
    const rec = store.create(makeRecord());
    store.cancel(rec.id);
    const found = store.get(rec.id);
    expect(found?.status).toBe('cancelled');
  });

  test('pending → completed flow', () => {
    const rec = store.create(makeRecord());
    expect(rec.status).toBe('pending');
    store.complete(rec.id, {});
    expect(store.get(rec.id)?.status).toBe('completed');
  });
});

// ─── listBySession / listAll / countByStatus / search ─────────────────────────

describe('list / count / search', () => {
  test('listBySession returns interviews for a session', () => {
    store.create(makeRecord({ sessionId: 'sess-A' }));
    store.create(makeRecord({ sessionId: 'sess-A' }));
    store.create(makeRecord({ sessionId: 'sess-B' }));
    expect(store.listBySession('sess-A')).toHaveLength(2);
    expect(store.listBySession('sess-B')).toHaveLength(1);
  });

  test('listBySession returns empty for unknown session', () => {
    expect(store.listBySession('unknown')).toHaveLength(0);
  });

  test('listAll returns all records', () => {
    store.create(makeRecord());
    store.create(makeRecord());
    store.create(makeRecord());
    expect(store.listAll()).toHaveLength(3);
  });

  test('countByStatus returns status breakdown', () => {
    store.create(makeRecord());
    const r2 = store.create(makeRecord());
    store.complete(r2.id, {});
    const counts = store.countByStatus();
    expect(typeof counts.pending).toBe('number');
  });

  test('search finds by title', () => {
    store.create(makeRecord({ title: 'Onboarding Interview' }));
    store.create(makeRecord({ title: 'Exit Survey' }));
    const results = store.search('Onboarding');
    expect(results.some(r => r.title === 'Onboarding Interview')).toBe(true);
  });

  test('search returns empty for no match', () => {
    store.create(makeRecord({ title: 'Test' }));
    expect(store.search('xyzzy_notfound_999')).toHaveLength(0);
  });
});
