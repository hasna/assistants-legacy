import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  addTask,
  clearCompletedTasks,
  clearPendingTasks,
  deleteTask,
  getTask,
  getTasks,
  loadTaskStore,
  updateTask,
} from '../src/tasks/adapter';
import { closeDatabase, resetDatabaseSingleton } from '../src/database';

describe('Task store dependency cleanup', () => {
  let tempDir: string;
  let originalAssistantsDir: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'tasks-store-'));
    originalAssistantsDir = process.env.ASSISTANTS_DIR;
    process.env.ASSISTANTS_DIR = tempDir;
    resetDatabaseSingleton();
  });

  afterEach(async () => {
    closeDatabase();
    resetDatabaseSingleton();
    process.env.ASSISTANTS_DIR = originalAssistantsDir;
    await rm(tempDir, { recursive: true, force: true });
  });

  test('deleteTask removes references from blockedBy/blocks', async () => {
    const t1 = await addTask(tempDir, { description: 't1' });
    const t2 = await addTask(tempDir, { description: 't2', blockedBy: [t1.id] });

    expect((await getTask(tempDir, t2.id))?.blockedBy).toEqual([t1.id]);

    const deleted = await deleteTask(tempDir, t1.id);
    expect(deleted).toBe(true);

    const updatedT2 = await getTask(tempDir, t2.id);
    expect(updatedT2?.blockedBy ?? []).not.toContain(t1.id);
    expect(updatedT2?.blockedBy).toEqual([]);
  });

  test('clearPendingTasks removes references from remaining tasks', async () => {
    const t1 = await addTask(tempDir, { description: 't1' });
    const t2 = await addTask(tempDir, { description: 't2', blockedBy: [t1.id] });

    const removed = await clearPendingTasks(tempDir);
    expect(removed).toBe(2);

    const updatedT2 = await getTask(tempDir, t2.id);
    expect(updatedT2).toBeNull();
  });

  test('clearCompletedTasks removes references to completed tasks', async () => {
    const t1 = await addTask(tempDir, { description: 't1' });
    const t2 = await addTask(tempDir, { description: 't2', blockedBy: [t1.id] });

    await updateTask(tempDir, t1.id, { status: 'completed' });

    const removed = await clearCompletedTasks(tempDir);
    expect(removed).toBe(1);

    const updatedT2 = await getTask(tempDir, t2.id);
    expect(updatedT2?.blockedBy ?? []).not.toContain(t1.id);
    expect(updatedT2?.blockedBy).toEqual([]);
  });

  test('loadTaskStore returns tasks with empty dependency arrays when none are set', async () => {
    await addTask(tempDir, { description: 'no deps' });

    const data = await loadTaskStore(tempDir);
    expect(data.tasks.length).toBe(1);
    expect(data.tasks[0].blockedBy).toEqual([]);
    expect(data.tasks[0].blocks).toEqual([]);
  });

  test('addTask ignores blockedBy/blocks that do not exist', async () => {
    const task = await addTask(tempDir, {
      description: 'child',
      blockedBy: ['missing-1'],
      blocks: ['missing-2'],
    });

    // Edges to non-existent tasks are skipped, leaving no dependencies.
    expect(task.blockedBy).toEqual([]);
    expect(task.blocks).toEqual([]);
  });

  test('addTask wires up valid blockedBy/blocks dependencies', async () => {
    const t1 = await addTask(tempDir, { description: 't1' });
    const t3 = await addTask(tempDir, { description: 't3' });
    const t2 = await addTask(tempDir, {
      description: 't2',
      blockedBy: [t1.id],
      blocks: [t3.id],
    });

    const fetched = await getTask(tempDir, t2.id);
    expect(fetched?.blockedBy).toEqual([t1.id]);
    expect(fetched?.blocks).toEqual([t3.id]);
  });
});
