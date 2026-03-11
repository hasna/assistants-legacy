/**
 * Registry adapter for @hasna/connectors
 * Provides access to the 62-connector registry for discovery and installation.
 * The native ConnectorBridge still handles runtime execution — this adapter adds
 * the ability to browse and install from the curated registry.
 */

import {
  CONNECTORS,
  CATEGORIES,
  getConnector as getRegistryConnector,
  getConnectorsByCategory,
  searchConnectors as searchRegistryConnectors,
  installConnector,
  getInstalledConnectors,
  removeConnector,
  type ConnectorMeta,
} from '@hasna/connectors';

export interface RegistryConnectorInfo {
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  installed?: boolean;
}

/**
 * Search the @hasna/connectors registry for available connectors.
 */
export function searchConnectorRegistry(query: string): RegistryConnectorInfo[] {
  const results = searchRegistryConnectors(query);
  return results.map(metaToInfo);
}

/**
 * List all available connector categories from the registry.
 */
export function listConnectorCategories(): string[] {
  return [...CATEGORIES];
}

/**
 * List all connectors in the registry, optionally filtered by category.
 */
export function listRegistryConnectors(category?: string): RegistryConnectorInfo[] {
  if (category) {
    return getConnectorsByCategory(category).map(metaToInfo);
  }
  return CONNECTORS.map(metaToInfo);
}

/**
 * Get details for a specific connector from the registry.
 */
export function getConnectorFromRegistry(name: string): RegistryConnectorInfo | null {
  const connector = getRegistryConnector(name);
  if (!connector) return null;
  return metaToInfo(connector);
}

/**
 * Install a connector from the registry.
 * After installation the ConnectorBridge will auto-discover it from PATH.
 * @param name - Connector name (e.g. 'stripe', 'figma', 'gmail')
 * @param scope - 'project' (.connectors/) or 'global' (~/.connectors/)
 * @param cwd - Working directory for project scope
 */
export async function installConnectorFromRegistry(
  name: string,
  scope: 'project' | 'global' = 'global',
  cwd?: string,
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const result = await installConnector(name, {
      global: scope === 'global',
      projectDir: scope === 'project' ? cwd : undefined,
    });
    if (!result.success) {
      return { success: false, error: result.error ?? 'Installation failed' };
    }
    return { success: true, path: result.path };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get installed connectors from the registry.
 */
export function getInstalledRegistryConnectors(
  scope: 'project' | 'global' = 'global',
  cwd?: string,
): string[] {
  try {
    return getInstalledConnectors({
      global: scope === 'global',
      projectDir: scope === 'project' ? cwd : undefined,
    });
  } catch {
    return [];
  }
}

/**
 * Remove an installed connector from the registry.
 */
export async function removeInstalledConnector(
  name: string,
  scope: 'project' | 'global' = 'global',
  cwd?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await removeConnector(name, {
      global: scope === 'global',
      projectDir: scope === 'project' ? cwd : undefined,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get total count of connectors in registry.
 */
export function getConnectorRegistryCount(): number {
  return CONNECTORS.length;
}

function metaToInfo(meta: ConnectorMeta): RegistryConnectorInfo {
  return {
    name: meta.name,
    displayName: meta.displayName,
    description: meta.description,
    category: meta.category,
    tags: meta.tags,
  };
}
