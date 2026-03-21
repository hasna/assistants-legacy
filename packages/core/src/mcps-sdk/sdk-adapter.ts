/**
 * MCPs SDK adapter — lazy loader for @hasna/mcps
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/mcps');
  return _lib;
}

export async function listMcpServers(args?: any): Promise<any> {
  try {
    return await (await lib()).listMcpServers(args);
  } catch {
    return [];
  }
}

export async function searchMcpServers(args?: any): Promise<any> {
  try {
    return await (await lib()).searchMcpServers(args);
  } catch {
    return [];
  }
}

export async function installMcpServer(args?: any): Promise<any> {
  try {
    return await (await lib()).installMcpServer(args);
  } catch {
    return null;
  }
}

export async function removeMcpServer(args?: any): Promise<any> {
  try {
    return await (await lib()).removeMcpServer(args);
  } catch {
    return null;
  }
}
