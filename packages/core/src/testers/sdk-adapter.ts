/**
 * Testers SDK adapter — lazy loader for @hasna/testers
 *
 * @hasna/testers exports named functions: createScenario, listScenarios,
 * runBatch/runByFilter, getResult/listResults, listScreenshots, etc.
 * All DB functions take typed objects, not generic args.
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/testers');
  return _lib;
}

export async function createScenario(input: {
  title: string;
  url: string;
  steps?: string;
}): Promise<any> {
  try {
    const m = await lib();
    return await m.createScenario({
      title: input.title,
      url: input.url,
      steps: input.steps ? JSON.parse(input.steps) : undefined,
    });
  } catch {
    return null;
  }
}

export async function listScenarios(): Promise<any[]> {
  try {
    const m = await lib();
    return await m.listScenarios();
  } catch {
    return [];
  }
}

export async function runScenarios(scenarioIds?: string[]): Promise<any> {
  try {
    const m = await lib();
    if (scenarioIds?.length) {
      return await m.runBatch(scenarioIds);
    }
    // Run all scenarios
    return await m.runByFilter({});
  } catch {
    return null;
  }
}

export async function getResults(runId: string): Promise<any> {
  try {
    const m = await lib();
    if (m.getResultsByRun) return await m.getResultsByRun(runId);
    if (m.listResults) return await m.listResults({ run_id: runId });
    return null;
  } catch {
    return null;
  }
}

export async function getScreenshots(resultId?: string): Promise<any[]> {
  try {
    const m = await lib();
    if (resultId && m.getScreenshotsByResult) {
      return await m.getScreenshotsByResult(resultId);
    }
    return await m.listScreenshots();
  } catch {
    return [];
  }
}
