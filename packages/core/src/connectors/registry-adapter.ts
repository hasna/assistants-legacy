/**
 * Registry adapter for @hasna/connectors
 * Uses lazy imports to avoid module-level side effects in bundled context.
 */

// Type-only import (erased at runtime, no side effects)
import type { ConnectorMeta } from '@hasna/connectors';

let _connectorsLib: typeof import('@hasna/connectors') | null = null;
async function getConnectorsLib(): Promise<typeof import('@hasna/connectors')> {
  if (!_connectorsLib) {
    _connectorsLib = await import('@hasna/connectors');
  }
  return _connectorsLib;
}

export interface RegistryConnectorInfo {
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
}

export async function searchConnectorRegistry(query: string): Promise<RegistryConnectorInfo[]> {
  const lib = await getConnectorsLib();
  return lib.searchConnectors(query).map((m) => ({
    name: m.name, displayName: m.displayName,
    description: m.description, category: m.category, tags: m.tags,
  }));
}

export async function listConnectorCategories(): Promise<string[]> {
  const lib = await getConnectorsLib();
  return [...lib.CATEGORIES];
}

export async function listRegistryConnectors(category?: string): Promise<RegistryConnectorInfo[]> {
  const lib = await getConnectorsLib();
  const connectors = category ? lib.getConnectorsByCategory(category) : lib.CONNECTORS;
  return connectors.map((m) => ({
    name: m.name, displayName: m.displayName,
    description: m.description, category: m.category, tags: m.tags,
  }));
}

export function getConnectorRegistryCount(): number {
  return _connectorsLib ? _connectorsLib.CONNECTORS.length : 0;
}

export async function installConnectorFromRegistry(
  name: string,
  scope: 'project' | 'global' = 'global',
  cwd?: string,
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const lib = await getConnectorsLib();
    const result = await lib.installConnector(name, {
      global: scope === 'global',
      projectDir: scope === 'project' ? cwd : undefined,
    });
    if (!result.success) return { success: false, error: result.error ?? 'Installation failed' };
    return { success: true, path: result.path };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getInstalledRegistryConnectors(scope: 'project' | 'global' = 'global', cwd?: string): Promise<string[]> {
  try {
    const lib = await getConnectorsLib();
    return lib.getInstalledConnectors({
      global: scope === 'global',
      projectDir: scope === 'project' ? cwd : undefined,
    });
  } catch { return []; }
}

export async function removeInstalledConnector(name: string, scope: 'project' | 'global' = 'global', cwd?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const lib = await getConnectorsLib();
    await lib.removeConnector(name, {
      global: scope === 'global',
      projectDir: scope === 'project' ? cwd : undefined,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
