export {
  loadAgentDefinitions,
  getAgentDefinition,
  saveAgentDefinition,
  deleteAgentDefinition,
  getEffectiveSystemPrompt,
  setProjectRole,
  removeProjectRole,
  setAgentModelConfig,
  syncToClaudeAgents,
  type AgentDefinition,
} from './definitions';

export {
  SubagentAuditLog,
  type SubagentLogEntry,
  type SubagentToolCallEntry,
  type SubagentLogFilter,
} from './audit-log';
