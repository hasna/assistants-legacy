/**
 * Logs SDK adapter — lazy loader for @hasna/logs
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/logs' as any);
  return _lib;
}

export async function createLog(args?: any): Promise<any> {
  try {
    return await (await lib()).createLog(args);
  } catch {
    return null;
  }
}

export async function listLogs(args?: any): Promise<any> {
  try {
    return await (await lib()).listLogs(args);
  } catch {
    return [];
  }
}

export async function clearLogs(args?: any): Promise<any> {
  try {
    return await (await lib()).clearLogs(args);
  } catch {
    return null;
  }
}

export async function getStats(args?: any): Promise<any> {
  try {
    return await (await lib()).getStats(args);
  } catch {
    return null;
  }
}
