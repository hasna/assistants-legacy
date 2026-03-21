/**
 * Microservices SDK adapter — lazy loader for @hasna/microservices
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  // @ts-ignore — package ships JS without .d.ts
  if (!_lib) _lib = await import('@hasna/microservices');
  return _lib;
}

export async function listMicroservices(args?: any): Promise<any> {
  try {
    return await (await lib()).listMicroservices(args);
  } catch {
    return [];
  }
}

export async function installMicroservice(args?: any): Promise<any> {
  try {
    return await (await lib()).installMicroservice(args);
  } catch {
    return null;
  }
}

export async function removeMicroservice(args?: any): Promise<any> {
  try {
    return await (await lib()).removeMicroservice(args);
  } catch {
    return null;
  }
}

export async function runMicroservice(args?: any): Promise<any> {
  try {
    return await (await lib()).runMicroservice(args);
  } catch {
    return null;
  }
}

export async function searchMicroservices(args?: any): Promise<any> {
  try {
    return await (await lib()).searchMicroservices(args);
  } catch {
    return [];
  }
}
