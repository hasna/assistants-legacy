/**
 * Deployment SDK adapter — lazy loader for @hasna/deployment
 *
 * Exposes: deploy, status, rollback, list
 * Uses the lib/deployer.ts functions which handle provider dispatch internally.
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/deployment');
  return _lib;
}

export async function deploy(input: { projectId: string; environmentId: string; image?: string; commitSha?: string; version?: string; config?: Record<string, unknown> }): Promise<any> {
  try {
    return await (await lib()).deploy(input);
  } catch {
    return null;
  }
}

export async function getDeploymentStatus(projectId: string, environmentId: string): Promise<any> {
  try {
    return await (await lib()).getStatus(projectId, environmentId);
  } catch {
    return null;
  }
}

export async function rollback(projectId: string, environmentId: string, targetDeploymentId?: string): Promise<any> {
  try {
    return await (await lib()).rollback(projectId, environmentId, targetDeploymentId);
  } catch {
    return null;
  }
}

export async function listDeployments(filters?: { projectId?: string; environmentId?: string; status?: string }): Promise<any[]> {
  try {
    return await (await lib()).listDeployments(filters) ?? [];
  } catch {
    return [];
  }
}
