/**
 * Economy SDK adapter — lazy loader for @hasna/economy
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/economy' as any);
  return _lib;
}

export async function sync(args?: any): Promise<any> {
  try {
    return await (await lib()).sync(args);
  } catch {
    return null;
  }
}

export async function getCostSummary(args?: any): Promise<any> {
  try {
    return await (await lib()).getCostSummary(args);
  } catch {
    return null;
  }
}

export async function getModelBreakdown(args?: any): Promise<any> {
  try {
    return await (await lib()).getModelBreakdown(args);
  } catch {
    return null;
  }
}

export async function getProjectBreakdown(args?: any): Promise<any> {
  try {
    return await (await lib()).getProjectBreakdown(args);
  } catch {
    return null;
  }
}

export async function getSessions(args?: any): Promise<any> {
  try {
    return await (await lib()).getSessions(args);
  } catch {
    return null;
  }
}

export async function getTopSessions(args?: any): Promise<any> {
  try {
    return await (await lib()).getTopSessions(args);
  } catch {
    return null;
  }
}

export async function getBudgetStatus(args?: any): Promise<any> {
  try {
    return await (await lib()).getBudgetStatus(args);
  } catch {
    return null;
  }
}
