/**
 * Hooks SDK adapter — lazy loader for @hasna/hooks
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  // @ts-ignore — package ships JS without .d.ts
  if (!_lib) _lib = await import('@hasna/hooks');
  return _lib;
}

export async function listAvailableHooks(args?: any): Promise<any> {
  try {
    return await (await lib()).listAvailableHooks(args);
  } catch {
    return [];
  }
}

export async function installHook(args?: any): Promise<any> {
  try {
    return await (await lib()).installHook(args);
  } catch {
    return null;
  }
}

export async function removeHook(args?: any): Promise<any> {
  try {
    return await (await lib()).removeHook(args);
  } catch {
    return null;
  }
}

export async function getHookInfo(args?: any): Promise<any> {
  try {
    return await (await lib()).getHookInfo(args);
  } catch {
    return null;
  }
}
