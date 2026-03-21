/**
 * Configs SDK adapter — lazy loader for @hasna/configs
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/configs');
  return _lib;
}

export async function getConfig(args?: any): Promise<any> {
  try {
    return await (await lib()).getConfig(args);
  } catch {
    return null;
  }
}

export async function listConfigs(args?: any): Promise<any> {
  try {
    return await (await lib()).listConfigs(args);
  } catch {
    return [];
  }
}

export async function applyConfig(args?: any): Promise<any> {
  try {
    return await (await lib()).applyConfig(args);
  } catch {
    return null;
  }
}

export async function createConfig(args?: any): Promise<any> {
  try {
    return await (await lib()).createConfig(args);
  } catch {
    return null;
  }
}

export async function scanSecrets(args?: any): Promise<any> {
  try {
    return await (await lib()).scanSecrets(args);
  } catch {
    return null;
  }
}

export async function listProfiles(args?: any): Promise<any> {
  try {
    return await (await lib()).listProfiles(args);
  } catch {
    return [];
  }
}
