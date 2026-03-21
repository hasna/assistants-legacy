/**
 * Terminal SDK adapter — lazy loader for @hasna/terminal
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/terminal' as any);
  return _lib;
}

export async function execCommand(args?: any): Promise<any> {
  try {
    return await (await lib()).execCommand(args);
  } catch {
    return null;
  }
}
