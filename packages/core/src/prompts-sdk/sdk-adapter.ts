/**
 * Prompts SDK adapter — lazy loader for @hasna/prompts
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/prompts');
  return _lib;
}

export async function promptsSave(args?: any): Promise<any> {
  try {
    return await (await lib()).promptsSave(args);
  } catch {
    return null;
  }
}

export async function promptsGet(args?: any): Promise<any> {
  try {
    return await (await lib()).promptsGet(args);
  } catch {
    return null;
  }
}

export async function promptsList(args?: any): Promise<any> {
  try {
    return await (await lib()).promptsList(args);
  } catch {
    return [];
  }
}

export async function promptsSearch(args?: any): Promise<any> {
  try {
    return await (await lib()).promptsSearch(args);
  } catch {
    return [];
  }
}

export async function promptsRender(args?: any): Promise<any> {
  try {
    return await (await lib()).promptsRender(args);
  } catch {
    return null;
  }
}

export async function promptsDelete(args?: any): Promise<any> {
  try {
    return await (await lib()).promptsDelete(args);
  } catch {
    return null;
  }
}

export async function promptsChain(args?: any): Promise<any> {
  try {
    return await (await lib()).promptsChain(args);
  } catch {
    return null;
  }
}
