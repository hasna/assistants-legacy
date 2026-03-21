/**
 * Sessions SDK adapter — lazy loader for @hasna/sessions
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/sessions');
  return _lib;
}

export async function ingestSessions(args?: any): Promise<any> {
  try {
    return await (await lib()).ingestSessions(args);
  } catch {
    return null;
  }
}

export async function listSessions(args?: any): Promise<any> {
  try {
    return await (await lib()).listSessions(args);
  } catch {
    return [];
  }
}

export async function searchSessions(args?: any): Promise<any> {
  try {
    return await (await lib()).searchSessions(args);
  } catch {
    return [];
  }
}

export async function hybridSearch(args?: any): Promise<any> {
  try {
    return await (await lib()).hybridSearch(args);
  } catch {
    return [];
  }
}

export async function getSession(args?: any): Promise<any> {
  try {
    return await (await lib()).getSession(args);
  } catch {
    return null;
  }
}

export async function getSessionMessages(args?: any): Promise<any> {
  try {
    return await (await lib()).getSessionMessages(args);
  } catch {
    return [];
  }
}

export async function summarizeSession(args?: any): Promise<any> {
  try {
    return await (await lib()).summarizeSession(args);
  } catch {
    return null;
  }
}

export async function vectorSearch(args?: any): Promise<any> {
  try {
    return await (await lib()).vectorSearch(args);
  } catch {
    return [];
  }
}
