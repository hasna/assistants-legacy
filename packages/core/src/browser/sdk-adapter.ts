/**
 * Browser SDK adapter — lazy loader for @hasna/browser
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/browser');
  return _lib;
}

export async function browserNavigate(args?: any): Promise<any> {
  try {
    return await (await lib()).browserNavigate(args);
  } catch {
    return null;
  }
}

export async function browserScreenshot(args?: any): Promise<any> {
  try {
    return await (await lib()).browserScreenshot(args);
  } catch {
    return null;
  }
}

export async function browserClick(args?: any): Promise<any> {
  try {
    return await (await lib()).browserClick(args);
  } catch {
    return null;
  }
}

export async function browserType(args?: any): Promise<any> {
  try {
    return await (await lib()).browserType(args);
  } catch {
    return null;
  }
}

export async function browserExtract(args?: any): Promise<any> {
  try {
    return await (await lib()).browserExtract(args);
  } catch {
    return null;
  }
}

export async function browserGetText(args?: any): Promise<any> {
  try {
    return await (await lib()).browserGetText(args);
  } catch {
    return null;
  }
}

export async function browserSnapshot(args?: any): Promise<any> {
  try {
    return await (await lib()).browserSnapshot(args);
  } catch {
    return null;
  }
}
