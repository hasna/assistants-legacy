/**
 * Testers SDK adapter — lazy loader for @hasna/testers
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/testers');
  return _lib;
}

export async function createScenario(args?: any): Promise<any> {
  try {
    return await (await lib()).createScenario(args);
  } catch {
    return null;
  }
}

export async function listScenarios(args?: any): Promise<any> {
  try {
    return await (await lib()).listScenarios(args);
  } catch {
    return [];
  }
}

export async function runScenarios(args?: any): Promise<any> {
  try {
    return await (await lib()).runScenarios(args);
  } catch {
    return null;
  }
}

export async function getResults(args?: any): Promise<any> {
  try {
    return await (await lib()).getResults(args);
  } catch {
    return null;
  }
}

export async function getScreenshots(args?: any): Promise<any> {
  try {
    return await (await lib()).getScreenshots(args);
  } catch {
    return [];
  }
}
