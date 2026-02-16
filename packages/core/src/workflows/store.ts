/**
 * Workflow Store
 *
 * SQLite persistence for workflow executions.
 */

import { getDatabase } from '../database';
import type { DatabaseConnection } from '../runtime';
import type { WorkflowExecution, WorkflowExecutionStatus } from './types';

export class WorkflowStore {
  private db: DatabaseConnection;

  constructor(db?: DatabaseConnection) {
    this.db = db || getDatabase();
  }

  /**
   * Save a new workflow execution
   */
  save(execution: WorkflowExecution): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO workflow_executions (
        id, workflow_name, status, current_step,
        variables, step_results, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      execution.id,
      execution.workflowName,
      execution.status,
      execution.currentStep,
      JSON.stringify(execution.variables),
      JSON.stringify(execution.stepResults),
      execution.startedAt,
      execution.completedAt || null
    );
  }

  /**
   * Update execution status and step
   */
  update(id: string, updates: Partial<WorkflowExecution>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.currentStep !== undefined) {
      fields.push('current_step = ?');
      values.push(updates.currentStep);
    }
    if (updates.variables !== undefined) {
      fields.push('variables = ?');
      values.push(JSON.stringify(updates.variables));
    }
    if (updates.stepResults !== undefined) {
      fields.push('step_results = ?');
      values.push(JSON.stringify(updates.stepResults));
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt);
    }

    if (fields.length === 0) return;

    values.push(id);
    this.db.prepare(`UPDATE workflow_executions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  /**
   * Get a workflow execution by ID
   */
  get(id: string): WorkflowExecution | null {
    const row = this.db
      .query<WorkflowExecutionRow>('SELECT * FROM workflow_executions WHERE id = ?')
      .get(id);
    return row ? this.rowToExecution(row) : null;
  }

  /**
   * List workflow executions
   */
  list(options?: { status?: WorkflowExecutionStatus; limit?: number }): WorkflowExecution[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit || 50;

    const rows = this.db
      .query<WorkflowExecutionRow>(`SELECT * FROM workflow_executions ${where} ORDER BY started_at DESC LIMIT ?`)
      .all(...params, limit);

    return rows.map(r => this.rowToExecution(r));
  }

  /**
   * Delete a workflow execution
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM workflow_executions WHERE id = ?').run(id);
  }

  private rowToExecution(row: WorkflowExecutionRow): WorkflowExecution {
    return {
      id: row.id,
      workflowName: row.workflow_name,
      status: row.status as WorkflowExecutionStatus,
      currentStep: row.current_step,
      variables: JSON.parse(row.variables || '{}'),
      stepResults: JSON.parse(row.step_results || '{}'),
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
    };
  }
}

interface WorkflowExecutionRow {
  id: string;
  workflow_name: string;
  status: string;
  current_step: number;
  variables: string;
  step_results: string;
  started_at: string;
  completed_at: string | null;
}
