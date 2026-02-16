/**
 * Workflow Types
 *
 * Type definitions for the workflow automation system.
 */

/**
 * A single step in a workflow
 */
export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  /** The prompt/instruction to execute for this step */
  prompt: string;
  /** Tools this step is allowed to use */
  allowedTools?: string[];
  /** Condition to check before running (references variables) */
  condition?: string;
  /** Whether to wait for user confirmation before proceeding */
  requiresApproval?: boolean;
  /** Timeout in milliseconds for this step */
  timeout?: number;
  /** Variable name to store the result in */
  outputVariable?: string;
}

/**
 * A workflow variable with optional default
 */
export interface WorkflowVariable {
  name: string;
  description?: string;
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean;
  required?: boolean;
}

/**
 * Complete workflow definition loaded from YAML
 */
export interface WorkflowDefinition {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  variables?: WorkflowVariable[];
  steps: WorkflowStep[];
  /** Source file path */
  filePath?: string;
}

/**
 * Status of a workflow execution
 */
export type WorkflowExecutionStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Persisted workflow execution state
 */
export interface WorkflowExecution {
  id: string;
  workflowName: string;
  status: WorkflowExecutionStatus;
  currentStep: number;
  variables: Record<string, unknown>;
  stepResults: Record<string, string>;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

/**
 * Result of executing a single step
 */
export interface StepResult {
  stepId: string;
  stepName: string;
  success: boolean;
  output: string;
  duration: number;
  error?: string;
}
