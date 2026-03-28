/**
 * Recordings SDK adapter — lazy loader for @hasna/recordings
 *
 * @hasna/recordings exports: createRecording, getRecording, listRecordings,
 * deleteRecording, searchRecordings, transcribeAudio, getRecordingStats, etc.
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/recordings');
  return _lib;
}

export async function saveRecording(input: Record<string, unknown>): Promise<any> {
  try {
    const m = await lib();
    return await m.createRecording(input);
  } catch {
    return null;
  }
}

export async function getRecording(id: string): Promise<any> {
  try {
    const m = await lib();
    return await m.getRecording(id);
  } catch {
    return null;
  }
}

export async function listRecordings(limit = 20): Promise<any[]> {
  try {
    const m = await lib();
    return await m.listRecordings({ limit });
  } catch {
    return [];
  }
}

export async function searchRecordings(query: string): Promise<any[]> {
  try {
    const m = await lib();
    return await m.searchRecordings(query);
  } catch {
    return [];
  }
}

export async function deleteRecording(id: string): Promise<any> {
  try {
    const m = await lib();
    return await m.deleteRecording(id);
  } catch {
    return null;
  }
}

export async function transcribeAudio(filePath: string): Promise<any> {
  try {
    const m = await lib();
    return await m.transcribeAudio(filePath);
  } catch {
    return null;
  }
}
