/**
 * Attachments SDK adapter — lazy loader for @hasna/attachments
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  // @ts-ignore — package ships JS without .d.ts
  if (!_lib) _lib = await import('@hasna/attachments');
  return _lib;
}

export async function uploadAttachment(args?: any): Promise<any> {
  try {
    return await (await lib()).uploadAttachment(args);
  } catch {
    return null;
  }
}

export async function downloadAttachment(args?: any): Promise<any> {
  try {
    return await (await lib()).downloadAttachment(args);
  } catch {
    return null;
  }
}

export async function listAttachments(args?: any): Promise<any> {
  try {
    return await (await lib()).listAttachments(args);
  } catch {
    return [];
  }
}

export async function deleteAttachment(args?: any): Promise<any> {
  try {
    return await (await lib()).deleteAttachment(args);
  } catch {
    return null;
  }
}

export async function getLink(args?: any): Promise<any> {
  try {
    return await (await lib()).getLink(args);
  } catch {
    return null;
  }
}
