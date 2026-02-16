/**
 * Workflow Loader
 *
 * Loads workflow definitions from YAML files in:
 * - .assistants/workflows/ (built-in)
 * - ~/.assistants/workflows/ (user-defined)
 */

import { resolve, basename } from 'path';
import { homedir } from 'os';
import { getRuntime } from '../runtime';
import type { WorkflowDefinition, WorkflowStep } from './types';

/**
 * Parse YAML frontmatter from a workflow file
 * Simple parser that handles the workflow YAML format without external deps
 */
function parseWorkflowYaml(content: string): WorkflowDefinition | null {
  try {
    const lines = content.split('\n');
    const def: Partial<WorkflowDefinition> = {};
    const steps: WorkflowStep[] = [];
    let currentStep: Partial<WorkflowStep> | null = null;
    let inSteps = false;
    let stepIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('#') || trimmed === '') continue;

      // Top-level properties
      if (!line.startsWith(' ') && !line.startsWith('\t') && trimmed.includes(':')) {
        const colonIdx = trimmed.indexOf(':');
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();

        if (key === 'steps') {
          inSteps = true;
          continue;
        }

        inSteps = false;

        if (key === 'name') def.name = unquote(value);
        else if (key === 'description') def.description = unquote(value);
        else if (key === 'version') def.version = unquote(value);
        else if (key === 'author') def.author = unquote(value);
        else if (key === 'tags') {
          def.tags = value.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(Boolean);
        }
        continue;
      }

      // Step items
      if (inSteps && trimmed.startsWith('- ')) {
        // New step
        if (currentStep && currentStep.name) {
          steps.push(finalizeStep(currentStep, stepIndex++));
        }
        currentStep = {};
        const afterDash = trimmed.slice(2).trim();
        if (afterDash.includes(':')) {
          const colonIdx = afterDash.indexOf(':');
          const key = afterDash.slice(0, colonIdx).trim();
          const value = afterDash.slice(colonIdx + 1).trim();
          applyStepProperty(currentStep, key, value);
        }
        continue;
      }

      // Step properties (indented)
      if (inSteps && currentStep && (line.startsWith('    ') || line.startsWith('\t\t'))) {
        if (trimmed.includes(':')) {
          const colonIdx = trimmed.indexOf(':');
          const key = trimmed.slice(0, colonIdx).trim();
          const value = trimmed.slice(colonIdx + 1).trim();
          applyStepProperty(currentStep, key, value);
        }
      }
    }

    // Don't forget the last step
    if (currentStep && currentStep.name) {
      steps.push(finalizeStep(currentStep, stepIndex));
    }

    if (!def.name || steps.length === 0) return null;

    return {
      name: def.name,
      description: def.description || '',
      version: def.version,
      author: def.author,
      tags: def.tags,
      steps,
    };
  } catch {
    return null;
  }
}

function applyStepProperty(step: Partial<WorkflowStep>, key: string, value: string): void {
  const v = unquote(value);
  if (key === 'name') step.name = v;
  else if (key === 'description') step.description = v;
  else if (key === 'prompt') step.prompt = v;
  else if (key === 'outputVariable' || key === 'output_variable') step.outputVariable = v;
  else if (key === 'requiresApproval' || key === 'requires_approval') step.requiresApproval = v === 'true';
  else if (key === 'timeout') step.timeout = parseInt(v, 10) || undefined;
  else if (key === 'condition') step.condition = v;
  else if (key === 'allowed_tools' || key === 'allowedTools') {
    step.allowedTools = v.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(Boolean);
  }
}

function finalizeStep(step: Partial<WorkflowStep>, index: number): WorkflowStep {
  return {
    id: `step-${index}`,
    name: step.name || `Step ${index + 1}`,
    description: step.description,
    prompt: step.prompt || step.name || '',
    allowedTools: step.allowedTools,
    condition: step.condition,
    requiresApproval: step.requiresApproval,
    timeout: step.timeout,
    outputVariable: step.outputVariable,
  };
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * WorkflowLoader - discovers and loads workflow definitions
 */
export class WorkflowLoader {
  private workflows: Map<string, WorkflowDefinition> = new Map();

  /**
   * Load workflows from default locations
   */
  async loadAll(): Promise<void> {
    const runtime = getRuntime();
    const locations = [
      // Built-in workflows (relative to install)
      resolve(process.cwd(), '.assistants/workflows'),
      // User workflows
      resolve(homedir(), '.assistants/workflows'),
    ];

    // Also check for built-in workflows from dist
    const distWorkflows = resolve(__dirname, '../../.assistants/workflows');
    locations.push(distWorkflows);

    for (const dir of locations) {
      try {
        const ymlFiles: string[] = [];
        for await (const f of runtime.glob('*.yml', { cwd: dir })) ymlFiles.push(f);
        for await (const f of runtime.glob('*.yaml', { cwd: dir })) ymlFiles.push(f);
        const yamlFiles = ymlFiles;

        for (const file of yamlFiles) {
          try {
            const fullPath = resolve(dir, file);
            const content = await runtime.file(fullPath).text();
            const workflow = parseWorkflowYaml(content);
            if (workflow) {
              workflow.filePath = fullPath;
              this.workflows.set(workflow.name, workflow);
            }
          } catch {
            // Skip invalid files
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }
  }

  /**
   * Load a single workflow from a file
   */
  async loadFile(filePath: string): Promise<WorkflowDefinition | null> {
    try {
      const runtime = getRuntime();
      const content = await runtime.file(filePath).text();
      const workflow = parseWorkflowYaml(content);
      if (workflow) {
        workflow.filePath = filePath;
        this.workflows.set(workflow.name, workflow);
      }
      return workflow;
    } catch {
      return null;
    }
  }

  /**
   * Get a workflow by name
   */
  get(name: string): WorkflowDefinition | undefined {
    return this.workflows.get(name);
  }

  /**
   * List all loaded workflows
   */
  list(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Check if a workflow exists
   */
  has(name: string): boolean {
    return this.workflows.has(name);
  }
}
