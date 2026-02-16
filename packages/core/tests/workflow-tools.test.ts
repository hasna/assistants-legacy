import { describe, test, expect } from 'bun:test';
import { WorkflowTools } from '../src/tools/workflows';
import { ToolRegistry } from '../src/tools/registry';

describe('WorkflowTools', () => {
  describe('registerAll', () => {
    test('registers all 4 workflow tools', () => {
      const registry = new ToolRegistry();
      WorkflowTools.registerAll(registry);

      expect(registry.hasTool('workflow_list')).toBe(true);
      expect(registry.hasTool('workflow_run')).toBe(true);
      expect(registry.hasTool('workflow_status')).toBe(true);
      expect(registry.hasTool('workflow_update')).toBe(true);
    });

    test('does not register unexpected tools', () => {
      const registry = new ToolRegistry();
      WorkflowTools.registerAll(registry);

      expect(registry.hasTool('workflow_delete')).toBe(false);
      expect(registry.hasTool('workflow_create')).toBe(false);
    });

    test('tool definitions have correct names', () => {
      const registry = new ToolRegistry();
      WorkflowTools.registerAll(registry);

      const listTool = registry.getTool('workflow_list');
      expect(listTool).toBeDefined();
      expect(listTool!.name).toBe('workflow_list');
      expect(listTool!.description).toBeTruthy();

      const runTool = registry.getTool('workflow_run');
      expect(runTool).toBeDefined();
      expect(runTool!.parameters.required).toContain('name');

      const statusTool = registry.getTool('workflow_status');
      expect(statusTool).toBeDefined();

      const updateTool = registry.getTool('workflow_update');
      expect(updateTool).toBeDefined();
      expect(updateTool!.parameters.required).toContain('executionId');
      expect(updateTool!.parameters.required).toContain('action');
    });
  });
});
