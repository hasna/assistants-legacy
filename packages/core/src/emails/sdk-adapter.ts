/**
 * Emails SDK adapter — lazy loader for @hasna/emails
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/emails');
  return _lib;
}

export async function sendEmail(args?: any): Promise<any> {
  try {
    return await (await lib()).sendEmail(args);
  } catch {
    return null;
  }
}

export async function listEmails(args?: any): Promise<any> {
  try {
    return await (await lib()).listEmails(args);
  } catch {
    return [];
  }
}

export async function getEmail(args?: any): Promise<any> {
  try {
    return await (await lib()).getEmail(args);
  } catch {
    return null;
  }
}

export async function searchEmails(args?: any): Promise<any> {
  try {
    return await (await lib()).searchEmails(args);
  } catch {
    return [];
  }
}

export async function listAddresses(args?: any): Promise<any> {
  try {
    return await (await lib()).listAddresses(args);
  } catch {
    return [];
  }
}

export async function getStats(args?: any): Promise<any> {
  try {
    return await (await lib()).getStats(args);
  } catch {
    return null;
  }
}

export async function syncInbox(args?: any): Promise<any> {
  try {
    return await (await lib()).syncInbox(args);
  } catch {
    return null;
  }
}

export async function listInboundEmails(args?: any): Promise<any> {
  try {
    return await (await lib()).listInboundEmails(args);
  } catch {
    return [];
  }
}

export async function triageEmail(args?: any): Promise<any> {
  try {
    return await (await lib()).triageEmail(args);
  } catch {
    return null;
  }
}
