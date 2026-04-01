/**
 * Connector tools — ConnectorBridge and connector execute/search/list tools.
 * Split into domain files:
 *   connector-bridge.ts   — ConnectorBridge class (~1130 LOC)
 *   connector-tools.ts    — execute/search/list tool definitions (~387 LOC)
 */
export { ConnectorBridge } from './connector-bridge';
export {
  connectorExecuteTool,
  type ConnectorExecuteContext,
  createConnectorExecuteExecutor,
  registerConnectorExecuteTool,
  connectorsSearchTool,
  type ConnectorSearchContext,
  createConnectorsSearchExecutor,
  registerConnectorsSearchTool,
  connectorsListTool,
  type ConnectorListContext,
  createConnectorsListExecutor,
  registerConnectorsListTool,
} from './connector-tools';
