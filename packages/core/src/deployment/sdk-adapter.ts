/**
 * Deployment SDK adapter — lazy loader for @hasna/deployment
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/deployment');
  return _lib;
}

export async function deploy(args?: any): Promise<any> {
  try {
    return await (await lib()).deploy(args);
  } catch {
    return null;
  }
}

export async function getDeploymentStatus(args?: any): Promise<any> {
  try {
    return await (await lib()).getDeploymentStatus(args);
  } catch {
    return null;
  }
}

export async function listDeployments(args?: any): Promise<any> {
  try {
    return await (await lib()).listDeployments(args);
  } catch {
    return [];
  }
}

export async function rollback(args?: any): Promise<any> {
  try {
    return await (await lib()).rollback(args);
  } catch {
    return null;
  }
}

export async function listEnvironments(args?: any): Promise<any> {
  try {
    return await (await lib()).listEnvironments(args);
  } catch {
    return [];
  }
}

export async function getDeploymentLogs(args?: any): Promise<any> {
  try {
    return await (await lib()).getDeploymentLogs(args);
  } catch {
    return null;
  }
}
