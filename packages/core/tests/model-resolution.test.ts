/**
 * Tests for the model catalog resolution helpers (plan P6 — test parity).
 * These back the AI-SDK migration's provider-prefixed model ids, so they're
 * worth pinning explicitly.
 */
import { describe, expect, test } from 'bun:test';
import {
  MODELS,
  getModelById,
  getProviderForModel,
  isValidModel,
  getAllModelIds,
  formatModelInfo,
  getModelsGroupedByProvider,
} from '../src/llm/models';

// A known catalog model to anchor assertions.
const sample = MODELS[0];
const sampleId = `${sample.provider}:${sample.id}`;

describe('model catalog resolution', () => {
  test('getAllModelIds returns provider-prefixed ids for every model', () => {
    const ids = getAllModelIds();
    expect(ids.length).toBe(MODELS.length);
    expect(ids).toContain(sampleId);
    for (const id of ids) expect(id).toContain(':');
  });

  test('getModelById resolves a prefixed id, rejects unknown/bare', () => {
    expect(getModelById(sampleId)?.id).toBe(sample.id);
    expect(getModelById('nope:does-not-exist')).toBeUndefined();
    expect(getModelById(sample.id)).toBeUndefined(); // bare id is not resolvable here
  });

  test('getProviderForModel extracts the provider from a prefixed id', () => {
    expect(getProviderForModel(sampleId)).toBe(sample.provider);
    expect(getProviderForModel('bare-id')).toBeUndefined();
  });

  test('isValidModel reflects catalog membership', () => {
    expect(isValidModel(sampleId)).toBe(true);
    expect(isValidModel('anthropic:not-real')).toBe(false);
  });

  test('formatModelInfo includes the name and provider', () => {
    const info = formatModelInfo(sample);
    expect(info).toContain(sample.name);
    expect(info).toContain(sample.id);
  });

  test('getModelsGroupedByProvider buckets every model under its provider', () => {
    const grouped = getModelsGroupedByProvider();
    const total = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(MODELS.length);
    expect(grouped[sample.provider].some((m) => m.id === sample.id)).toBe(true);
  });
});
