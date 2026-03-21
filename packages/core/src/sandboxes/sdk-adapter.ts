/**
 * Sandboxes SDK adapter — lazy loader for @hasna/sandboxes
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/sandboxes');
  return _lib;
}

export async function createSandbox(args?: any): Promise<any> {
  try {
    return await (await lib()).createSandbox(args);
  } catch {
    return null;
  }
}

export async function getSandbox(args?: any): Promise<any> {
  try {
    return await (await lib()).getSandbox(args);
  } catch {
    return null;
  }
}

export async function listSandboxes(args?: any): Promise<any> {
  try {
    return await (await lib()).listSandboxes(args);
  } catch {
    return [];
  }
}

export async function execCommand(args?: any): Promise<any> {
  try {
    return await (await lib()).execCommand(args);
  } catch {
    return null;
  }
}

export async function readFile(args?: any): Promise<any> {
  try {
    return await (await lib()).readFile(args);
  } catch {
    return null;
  }
}

export async function writeFile(args?: any): Promise<any> {
  try {
    return await (await lib()).writeFile(args);
  } catch {
    return null;
  }
}

export async function deleteSandbox(args?: any): Promise<any> {
  try {
    return await (await lib()).deleteSandbox(args);
  } catch {
    return null;
  }
}
