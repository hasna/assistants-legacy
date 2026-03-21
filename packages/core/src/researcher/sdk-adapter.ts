/**
 * Researcher SDK adapter — lazy loader for @hasna/researcher
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  // @ts-ignore — package ships JS without .d.ts
  if (!_lib) _lib = await import('@hasna/researcher');
  return _lib;
}

export async function runCycle(args?: any): Promise<any> {
  try {
    return await (await lib()).runCycle(args);
  } catch {
    return null;
  }
}

export async function queryKnowledge(args?: any): Promise<any> {
  try {
    return await (await lib()).queryKnowledge(args);
  } catch {
    return null;
  }
}

export async function saveKnowledge(args?: any): Promise<any> {
  try {
    return await (await lib()).saveKnowledge(args);
  } catch {
    return null;
  }
}

export async function exportKnowledge(args?: any): Promise<any> {
  try {
    return await (await lib()).exportKnowledge(args);
  } catch {
    return null;
  }
}

export async function getStatus(args?: any): Promise<any> {
  try {
    return await (await lib()).getStatus(args);
  } catch {
    return null;
  }
}

export async function listCycles(args?: any): Promise<any> {
  try {
    return await (await lib()).listCycles(args);
  } catch {
    return [];
  }
}
