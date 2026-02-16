import type { Tool, ToolCall, ValidationConfig } from '@hasna/assistants-shared';
import { ErrorCodes, ValidationError } from '../errors';
import { validateToolInput } from './schema';

export interface LLMResponseValidation {
  validated: Map<string, ToolCall>;
  errors: ValidationError[];
  errorsByCallId: Map<string, ValidationError[]>;
}

export function validateToolCalls(
  toolCalls: ToolCall[],
  tools: Tool[],
  validationConfig?: ValidationConfig,
): LLMResponseValidation {
  const toolMap = new Map<string, Tool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  const validated = new Map<string, ToolCall>();
  const errors: ValidationError[] = [];
  const errorsByCallId = new Map<string, ValidationError[]>();

  for (const call of toolCalls) {
    const tool = toolMap.get(call.name);
    if (!tool) {
      const err = new ValidationError(`Unknown tool: ${call.name}`, {
        code: ErrorCodes.VALIDATION_SCHEMA_ERROR,
        field: call.name,
        expected: 'known tool',
        received: call.name,
        recoverable: false,
        retryable: false,
        suggestion: 'Use a supported tool name.',
      });
      errors.push(err);
      errorsByCallId.set(call.id, [err]);
      continue;
    }

    const validationMode = resolveValidationMode(validationConfig, call.name);
    const validation = validateToolInput(call.name, tool.parameters, call.input);
    if (!validation.valid) {
      if (validationMode === 'lenient') {
        validated.set(call.id, {
          ...call,
          input: validation.coerced ?? call.input,
        });
        continue;
      }
      const callErrors = validation.errors && validation.errors.length > 0
        ? validation.errors
        : [
          new ValidationError(`Invalid input for ${call.name}`, {
            code: ErrorCodes.VALIDATION_SCHEMA_ERROR,
            field: call.name,
            expected: 'valid input',
            received: typeof call.input,
            recoverable: false,
            retryable: false,
          }),
        ];
      errors.push(...callErrors);
      errorsByCallId.set(call.id, callErrors);
      continue;
    }

    validated.set(call.id, {
      ...call,
      input: validation.coerced ?? call.input,
    });
  }

  return { validated, errors, errorsByCallId };
}

function resolveValidationMode(config: ValidationConfig | undefined, toolName: string): 'strict' | 'lenient' {
  return config?.perTool?.[toolName]?.mode ?? config?.mode ?? 'strict';
}
