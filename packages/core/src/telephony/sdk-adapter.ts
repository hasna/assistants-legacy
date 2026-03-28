/**
 * Telephony SDK adapter — lazy loader for @hasna/telephony
 *
 * Delegates to the @hasna/telephony SDK when available.
 * Falls back gracefully if the SDK is not installed.
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/telephony' as any);
  return _lib;
}

export async function sendSms(params: { to: string; body: string; from?: string }): Promise<any> {
  try {
    const t = await lib();
    return await t.sendSms(params);
  } catch {
    return null;
  }
}

export async function sendWhatsApp(params: { to: string; body: string; from?: string }): Promise<any> {
  try {
    const t = await lib();
    return await t.sendWhatsApp(params);
  } catch {
    return null;
  }
}

export async function makeCall(params: { to: string; from?: string; firstMessage?: string }): Promise<any> {
  try {
    const t = await lib();
    return await t.makeCall(params);
  } catch {
    return null;
  }
}

export async function listCalls(params?: { limit?: number }): Promise<any> {
  try {
    const t = await lib();
    return await t.listCalls(params);
  } catch {
    return null;
  }
}

export async function listMessages(params?: { limit?: number; type?: string }): Promise<any> {
  try {
    const t = await lib();
    return await t.listMessages(params);
  } catch {
    return null;
  }
}

export async function listPhoneNumbers(): Promise<any> {
  try {
    const t = await lib();
    return await t.listPhoneNumbers();
  } catch {
    return null;
  }
}

export async function getStatus(): Promise<any> {
  try {
    const t = await lib();
    return await t.getStatus();
  } catch {
    return null;
  }
}

export async function endCall(params: { callSid: string }): Promise<any> {
  try {
    const t = await lib();
    return await t.endCall(params);
  } catch {
    return null;
  }
}
