import { describe, test, expect } from 'bun:test';
import {
  TaskGraph,
  TaskGraphScheduler,
  DEFAULT_SCHEDULER_OPTIONS,
} from '../src/swarm/task-graph';
import type { SwarmTask } from '../src/swarm/types';

describe('TaskGraph: construction', () => {
  test('addTask assigns defaults and stores the task', () => {
    const g = new TaskGraph();
    const t = g.addTask({ id: 'a', description: 'do a' });
    expect(t.id).toBe('a');
    expect(t.status).toBe('pending');
    expect(t.role).toBe('worker');
    expect(t.priority).toBe(3);
    expect(t.dependsOn).toEqual([]);
    expect(g.getTask('a')).toBe(t);
  });

  test('addTask generates an id when none is provided', () => {
    const g = new TaskGraph();
    const t = g.addTask({ description: 'no id' });
    expect(typeof t.id).toBe('string');
    expect(t.id.length).toBeGreaterThan(0);
  });

  test('addTask throws on duplicate id', () => {
    const g = new TaskGraph();
    g.addTask({ id: 'dup', description: 'first' });
    expect(() => g.addTask({ id: 'dup', description: 'second' })).toThrow(/already exists/);
  });

  test('addTasks adds many and getAllTasks returns them', () => {
    const g = new TaskGraph();
    g.addTasks([
      { id: 'a', description: 'a' },
      { id: 'b', description: 'b' },
    ]);
    expect(g.getAllTasks().map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  test('getTask returns null for unknown id', () => {
    expect(new TaskGraph().getTask('nope')).toBeNull();
  });

  test('clear empties the graph', () => {
    const g = new TaskGraph();
    g.addTask({ id: 'a', description: 'a' });
    g.clear();
    expect(g.getAllTasks()).toEqual([]);
  });
});

describe('TaskGraph: dependency state', () => {
  function diamond(): TaskGraph {
    // a -> b, a -> c, (b,c) -> d
    const g = new TaskGraph();
    g.addTask({ id: 'a', description: 'a' });
    g.addTask({ id: 'b', description: 'b', dependsOn: ['a'] });
    g.addTask({ id: 'c', description: 'c', dependsOn: ['a'] });
    g.addTask({ id: 'd', description: 'd', dependsOn: ['b', 'c'] });
    return g;
  }

  test('isDependenciesSatisfied true for root, false for dependents until deps complete', () => {
    const g = diamond();
    expect(g.isDependenciesSatisfied('a')).toBe(true);
    expect(g.isDependenciesSatisfied('b')).toBe(false);
    g.updateTaskStatus('a', 'completed');
    expect(g.isDependenciesSatisfied('b')).toBe(true);
    expect(g.isDependenciesSatisfied('d')).toBe(false);
    g.updateTaskStatus('b', 'completed');
    g.updateTaskStatus('c', 'completed');
    expect(g.isDependenciesSatisfied('d')).toBe(true);
  });

  test('getReadyTasks returns only pending tasks with satisfied deps, sorted by priority', () => {
    const g = new TaskGraph();
    g.addTask({ id: 'low', description: 'low', priority: 5 });
    g.addTask({ id: 'high', description: 'high', priority: 1 });
    g.addTask({ id: 'dep', description: 'dep', dependsOn: ['high'] });
    const ready = g.getReadyTasks().map((t) => t.id);
    expect(ready).toEqual(['high', 'low']); // dep not ready, sorted by priority asc
  });

  test('isBlockedByFailure detects failed/blocked/cancelled dependencies', () => {
    const g = diamond();
    expect(g.isBlockedByFailure('b')).toBe(false);
    g.updateTaskStatus('a', 'failed');
    expect(g.isBlockedByFailure('b')).toBe(true);
    expect(g.isBlockedByFailure('c')).toBe(true);
  });

  test('markBlockedTasks cascades blocked status to transitive dependents', () => {
    const g = diamond();
    g.updateTaskStatus('a', 'failed');
    // Iteration is in insertion order (a,b,c,d): b and c are blocked by the
    // failed a, then d is blocked because b/c are now blocked — all in one pass.
    const blocked = g.markBlockedTasks().sort();
    expect(blocked).toEqual(['b', 'c', 'd']);
    expect(g.getTask('b')!.status).toBe('blocked');
    expect(g.getTask('d')!.status).toBe('blocked');
    // Idempotent: nothing left pending to block.
    expect(g.markBlockedTasks()).toEqual([]);
  });

  test('setTaskResult stores result and output', () => {
    const g = new TaskGraph();
    g.addTask({ id: 'a', description: 'a' });
    g.setTaskResult('a', { result: 'the answer' } as any);
    expect(g.getTask('a')!.output).toBe('the answer');
  });
});

describe('TaskGraph: ordering', () => {
  test('getTopologicalOrder respects dependencies', () => {
    const g = new TaskGraph();
    g.addTask({ id: 'a', description: 'a' });
    g.addTask({ id: 'b', description: 'b', dependsOn: ['a'] });
    g.addTask({ id: 'c', description: 'c', dependsOn: ['b'] });
    const order = g.getTopologicalOrder();
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    expect(order.length).toBe(3);
  });

  test('getExecutionLevels groups independent tasks for parallel execution', () => {
    const g = new TaskGraph();
    g.addTask({ id: 'a', description: 'a' });
    g.addTask({ id: 'b', description: 'b', dependsOn: ['a'] });
    g.addTask({ id: 'c', description: 'c', dependsOn: ['a'] });
    g.addTask({ id: 'd', description: 'd', dependsOn: ['b', 'c'] });
    const levels = g.getExecutionLevels();
    expect(levels[0]).toEqual(['a']);
    expect(levels[1].sort()).toEqual(['b', 'c']);
    expect(levels[2]).toEqual(['d']);
  });

  test('hasCycles is false for a DAG and true for a cycle', () => {
    const dag = new TaskGraph();
    dag.addTask({ id: 'a', description: 'a' });
    dag.addTask({ id: 'b', description: 'b', dependsOn: ['a'] });
    expect(dag.hasCycles()).toBe(false);

    const cyclic = new TaskGraph();
    cyclic.addTask({ id: 'x', description: 'x', dependsOn: ['y'] });
    cyclic.addTask({ id: 'y', description: 'y', dependsOn: ['x'] });
    expect(cyclic.hasCycles()).toBe(true);
  });

  test('getStats reports counts, levels and max parallelism', () => {
    const g = new TaskGraph();
    g.addTask({ id: 'a', description: 'a' });
    g.addTask({ id: 'b', description: 'b', dependsOn: ['a'] });
    g.addTask({ id: 'c', description: 'c', dependsOn: ['a'] });
    g.updateTaskStatus('a', 'completed');
    const stats = g.getStats();
    expect(stats.total).toBe(3);
    expect(stats.completed).toBe(1);
    expect(stats.pending).toBe(2);
    expect(stats.levels).toBe(2);
    expect(stats.maxParallelism).toBe(2);
  });

  test('getStats maxParallelism is 0 for an empty graph', () => {
    expect(new TaskGraph().getStats().maxParallelism).toBe(0);
  });
});

describe('TaskGraphScheduler', () => {
  test('clamps maxConcurrent to at least 1', () => {
    const g = new TaskGraph();
    const sched = new TaskGraphScheduler(g, { maxConcurrent: 0 });
    expect((sched as any).options.maxConcurrent).toBe(1);
  });

  test('falls back to default when maxConcurrent is not finite', () => {
    const g = new TaskGraph();
    const sched = new TaskGraphScheduler(g, { maxConcurrent: Infinity });
    expect((sched as any).options.maxConcurrent).toBe(DEFAULT_SCHEDULER_OPTIONS.maxConcurrent);
  });

  test('executes all tasks respecting dependency order', async () => {
    const g = new TaskGraph();
    g.addTask({ id: 'a', description: 'a' });
    g.addTask({ id: 'b', description: 'b', dependsOn: ['a'] });
    g.addTask({ id: 'c', description: 'c', dependsOn: ['b'] });

    const order: string[] = [];
    const sched = new TaskGraphScheduler(g, { maxConcurrent: 2, retryDelayMs: 1 });
    const results = await sched.execute(async (task: SwarmTask) => {
      order.push(task.id);
      return { success: true, result: `done-${task.id}` } as any;
    });

    expect(results.size).toBe(3);
    expect(results.get('a')!.success).toBe(true);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    expect(g.getTask('a')!.status).toBe('completed');
  });

  test('retries a failing task up to maxRetries then marks it failed', async () => {
    const g = new TaskGraph();
    g.addTask({ id: 'flaky', description: 'flaky', maxRetries: 2 });

    let attempts = 0;
    const sched = new TaskGraphScheduler(g, { maxRetries: 2, retryDelayMs: 1 });
    const results = await sched.execute(async () => {
      attempts++;
      throw new Error('boom');
    });

    expect(attempts).toBe(3); // initial + 2 retries
    expect(results.get('flaky')!.success).toBe(false);
    expect(g.getTask('flaky')!.status).toBe('failed');
  });
});
