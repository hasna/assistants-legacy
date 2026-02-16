/**
 * Workflow Executor
 *
 * Executes workflow definitions step by step with pause/resume support.
 */

import { generateId } from '@hasna/assistants-shared';
import type { WorkflowDefinition, WorkflowExecution, StepResult } from './types';
import { WorkflowStore } from './store';

export type StepExecutor = (prompt: string, allowedTools?: string[]) => Promise<string>;
export type ApprovalHandler = (stepName: string, description?: string) => Promise<boolean>;

export class WorkflowExecutor {
  private store: WorkflowStore;
  private stepExecutor: StepExecutor;
  private approvalHandler?: ApprovalHandler;

  constructor(
    store: WorkflowStore,
    stepExecutor: StepExecutor,
    approvalHandler?: ApprovalHandler
  ) {
    this.store = store;
    this.stepExecutor = stepExecutor;
    this.approvalHandler = approvalHandler;
  }

  /**
   * Start a new workflow execution
   */
  async start(
    workflow: WorkflowDefinition,
    variables?: Record<string, unknown>
  ): Promise<WorkflowExecution> {
    const execution: WorkflowExecution = {
      id: generateId(),
      workflowName: workflow.name,
      status: 'running',
      currentStep: 0,
      variables: { ...this.getDefaultVariables(workflow), ...variables },
      stepResults: {},
      startedAt: new Date().toISOString(),
    };

    this.store.save(execution);

    // Execute steps
    return this.executeSteps(workflow, execution);
  }

  /**
   * Resume a paused workflow execution
   */
  async resume(executionId: string, workflow: WorkflowDefinition): Promise<WorkflowExecution> {
    const execution = this.store.get(executionId);
    if (!execution) {
      throw new Error(`Workflow execution not found: ${executionId}`);
    }

    if (execution.status !== 'paused') {
      throw new Error(`Cannot resume workflow in status: ${execution.status}`);
    }

    execution.status = 'running';
    this.store.update(executionId, { status: 'running' });

    return this.executeSteps(workflow, execution);
  }

  /**
   * Pause a running workflow
   */
  pause(executionId: string): void {
    const execution = this.store.get(executionId);
    if (execution && execution.status === 'running') {
      this.store.update(executionId, { status: 'paused' });
    }
  }

  /**
   * Cancel a workflow execution
   */
  cancel(executionId: string): void {
    const execution = this.store.get(executionId);
    if (execution && (execution.status === 'running' || execution.status === 'paused')) {
      this.store.update(executionId, {
        status: 'cancelled',
        completedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Execute remaining steps in a workflow
   */
  private async executeSteps(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution
  ): Promise<WorkflowExecution> {
    for (let i = execution.currentStep; i < workflow.steps.length; i++) {
      // Check if paused
      const current = this.store.get(execution.id);
      if (current && current.status !== 'running') {
        return current;
      }

      const step = workflow.steps[i];

      // Check condition
      if (step.condition) {
        const conditionMet = this.evaluateCondition(step.condition, execution.variables);
        if (!conditionMet) {
          execution.stepResults[step.id] = 'Skipped (condition not met)';
          execution.currentStep = i + 1;
          this.store.update(execution.id, {
            currentStep: i + 1,
            stepResults: execution.stepResults,
          });
          continue;
        }
      }

      // Check approval
      if (step.requiresApproval && this.approvalHandler) {
        const approved = await this.approvalHandler(step.name, step.description);
        if (!approved) {
          this.store.update(execution.id, { status: 'paused' });
          execution.status = 'paused';
          return execution;
        }
      }

      // Substitute variables in prompt
      const prompt = this.substituteVariables(step.prompt, execution.variables);

      try {
        const startTime = Date.now();
        const output = await this.stepExecutor(prompt, step.allowedTools);
        const duration = Date.now() - startTime;

        const result: StepResult = {
          stepId: step.id,
          stepName: step.name,
          success: true,
          output,
          duration,
        };

        // Store result
        execution.stepResults[step.id] = output;

        // Store output variable
        if (step.outputVariable) {
          execution.variables[step.outputVariable] = output;
        }

        execution.currentStep = i + 1;
        this.store.update(execution.id, {
          currentStep: i + 1,
          stepResults: execution.stepResults,
          variables: execution.variables,
        });
      } catch (error) {
        execution.status = 'failed';
        execution.error = error instanceof Error ? error.message : String(error);
        this.store.update(execution.id, {
          status: 'failed',
          completedAt: new Date().toISOString(),
        });
        return execution;
      }
    }

    // All steps completed
    execution.status = 'completed';
    execution.completedAt = new Date().toISOString();
    this.store.update(execution.id, {
      status: 'completed',
      completedAt: execution.completedAt,
    });

    return execution;
  }

  /**
   * Replace ${variable} patterns in a prompt
   */
  private substituteVariables(prompt: string, variables: Record<string, unknown>): string {
    return prompt.replace(/\$\{(\w+)\}/g, (_, key) => {
      const value = variables[key];
      return value !== undefined ? String(value) : `\${${key}}`;
    });
  }

  /**
   * Evaluate a simple condition string
   */
  private evaluateCondition(condition: string, variables: Record<string, unknown>): boolean {
    // Simple conditions: "variableName" (truthy check) or "variableName == value"
    const eqMatch = condition.match(/^(\w+)\s*==\s*(.+)$/);
    if (eqMatch) {
      const varValue = String(variables[eqMatch[1]] || '');
      return varValue === eqMatch[2].trim();
    }

    const neqMatch = condition.match(/^(\w+)\s*!=\s*(.+)$/);
    if (neqMatch) {
      const varValue = String(variables[neqMatch[1]] || '');
      return varValue !== neqMatch[2].trim();
    }

    // Truthy check
    return Boolean(variables[condition]);
  }

  /**
   * Get default values for workflow variables
   */
  private getDefaultVariables(workflow: WorkflowDefinition): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    if (workflow.variables) {
      for (const v of workflow.variables) {
        if (v.default !== undefined) {
          defaults[v.name] = v.default;
        }
      }
    }
    return defaults;
  }
}
