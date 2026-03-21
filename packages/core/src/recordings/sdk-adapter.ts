/**
 * Recordings SDK adapter — lazy loader for @hasna/recordings
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/recordings');
  return _lib;
}

export async function saveRecording(args?: any): Promise<any> {
  try {
    return await (await lib()).saveRecording(args);
  } catch {
    return null;
  }
}

export async function getRecording(args?: any): Promise<any> {
  try {
    return await (await lib()).getRecording(args);
  } catch {
    return null;
  }
}

export async function listRecordings(args?: any): Promise<any> {
  try {
    return await (await lib()).listRecordings(args);
  } catch {
    return [];
  }
}

export async function searchRecordings(args?: any): Promise<any> {
  try {
    return await (await lib()).searchRecordings(args);
  } catch {
    return [];
  }
}

export async function deleteRecording(args?: any): Promise<any> {
  try {
    return await (await lib()).deleteRecording(args);
  } catch {
    return null;
  }
}

export async function transcribeAudio(args?: any): Promise<any> {
  try {
    return await (await lib()).transcribeAudio(args);
  } catch {
    return null;
  }
}
