import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  isAWSConfigured,
  isElevenLabsConfigured,
  isOpenAIConfigured,
  isAnyLLMConfigured,
  isExaConfigured,
  isSystemVoiceAvailable,
  getFeatureAvailability,
  getFeatureStatusMessage,
  validateFeatureEnvVars,
} from '../src/features';

// ─── Helper to temporarily set/unset env vars ─────────────────────────────────

type EnvSnapshot = Record<string, string | undefined>;

function setEnv(vars: Record<string, string | undefined>): EnvSnapshot {
  const snapshot: EnvSnapshot = {};
  for (const [k, v] of Object.entries(vars)) {
    snapshot[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return snapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const [k, v] of Object.entries(snapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// ─── isAWSConfigured ──────────────────────────────────────────────────────────

describe('isAWSConfigured', () => {
  let snap: EnvSnapshot;

  beforeEach(() => {
    snap = setEnv({
      AWS_REGION: undefined,
      AWS_DEFAULT_REGION: undefined,
      AWS_ACCESS_KEY_ID: undefined,
      AWS_SECRET_ACCESS_KEY: undefined,
    });
  });
  afterEach(() => restoreEnv(snap));

  test('false when no AWS vars set', () => {
    expect(isAWSConfigured()).toBe(false);
  });

  test('true when AWS_REGION is set', () => {
    process.env.AWS_REGION = 'us-east-1';
    expect(isAWSConfigured()).toBe(true);
  });

  test('true when AWS_DEFAULT_REGION is set', () => {
    process.env.AWS_DEFAULT_REGION = 'eu-west-1';
    expect(isAWSConfigured()).toBe(true);
  });

  test('true when access key + secret are set', () => {
    process.env.AWS_ACCESS_KEY_ID = 'AKID';
    process.env.AWS_SECRET_ACCESS_KEY = 'SECRET';
    expect(isAWSConfigured()).toBe(true);
  });

  test('false with only AWS_ACCESS_KEY_ID (missing secret)', () => {
    process.env.AWS_ACCESS_KEY_ID = 'AKID';
    expect(isAWSConfigured()).toBe(false);
  });
});

// ─── isElevenLabsConfigured ───────────────────────────────────────────────────

describe('isElevenLabsConfigured', () => {
  let snap: EnvSnapshot;
  beforeEach(() => { snap = setEnv({ ELEVENLABS_API_KEY: undefined }); });
  afterEach(() => restoreEnv(snap));

  test('false when not set', () => expect(isElevenLabsConfigured()).toBe(false));
  test('true when set', () => {
    process.env.ELEVENLABS_API_KEY = 'el-key';
    expect(isElevenLabsConfigured()).toBe(true);
  });
});

// ─── isOpenAIConfigured ───────────────────────────────────────────────────────

describe('isOpenAIConfigured', () => {
  let snap: EnvSnapshot;
  beforeEach(() => { snap = setEnv({ OPENAI_API_KEY: undefined }); });
  afterEach(() => restoreEnv(snap));

  test('false when not set', () => expect(isOpenAIConfigured()).toBe(false));
  test('true when set', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(isOpenAIConfigured()).toBe(true);
  });
});

// ─── isExaConfigured ─────────────────────────────────────────────────────────

describe('isExaConfigured', () => {
  let snap: EnvSnapshot;
  beforeEach(() => { snap = setEnv({ EXA_API_KEY: undefined }); });
  afterEach(() => restoreEnv(snap));

  test('false when not set', () => expect(isExaConfigured()).toBe(false));
  test('true when set', () => {
    process.env.EXA_API_KEY = 'exa-key';
    expect(isExaConfigured()).toBe(true);
  });
});

// ─── isSystemVoiceAvailable ───────────────────────────────────────────────────

describe('isSystemVoiceAvailable', () => {
  test('returns boolean', () => {
    expect(typeof isSystemVoiceAvailable()).toBe('boolean');
  });

  test('returns true on macOS', () => {
    if (process.platform === 'darwin') {
      expect(isSystemVoiceAvailable()).toBe(true);
    }
  });
});

// ─── getFeatureAvailability ───────────────────────────────────────────────────

describe('getFeatureAvailability', () => {
  let snap: EnvSnapshot;

  beforeEach(() => {
    snap = setEnv({
      ANTHROPIC_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      XAI_API_KEY: undefined,
      MISTRAL_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      AWS_REGION: undefined,
      AWS_DEFAULT_REGION: undefined,
      AWS_ACCESS_KEY_ID: undefined,
      AWS_SECRET_ACCESS_KEY: undefined,
      ELEVENLABS_API_KEY: undefined,
      EXA_API_KEY: undefined,
    });
  });
  afterEach(() => restoreEnv(snap));

  test('all false when no keys set (except systemVoice)', () => {
    const f = getFeatureAvailability();
    expect(f.coreChat).toBe(false);
    expect(f.awsFeatures).toBe(false);
    expect(f.elevenLabsTTS).toBe(false);
    expect(f.whisperSTT).toBe(false);
    expect(f.exaSearch).toBe(false);
    // systemVoice depends on platform, not env
  });

  test('coreChat true when ANTHROPIC_API_KEY set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    expect(getFeatureAvailability().coreChat).toBe(true);
  });

  test('coreChat true when GEMINI_API_KEY set', () => {
    process.env.GEMINI_API_KEY = 'gemini-test';
    expect(getFeatureAvailability().coreChat).toBe(true);
  });

  test('coreChat true when OPENAI_API_KEY set', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(getFeatureAvailability().coreChat).toBe(true);
  });

  test('awsFeatures true when AWS_REGION set', () => {
    process.env.AWS_REGION = 'us-east-1';
    expect(getFeatureAvailability().awsFeatures).toBe(true);
  });

  test('returns all expected keys', () => {
    const f = getFeatureAvailability();
    expect(f).toHaveProperty('coreChat');
    expect(f).toHaveProperty('awsFeatures');
    expect(f).toHaveProperty('elevenLabsTTS');
    expect(f).toHaveProperty('whisperSTT');
    expect(f).toHaveProperty('exaSearch');
    expect(f).toHaveProperty('systemVoice');
  });
});

// ─── getFeatureStatusMessage ──────────────────────────────────────────────────

describe('getFeatureStatusMessage', () => {
  let snap: EnvSnapshot;

  beforeEach(() => {
    snap = setEnv({
      ANTHROPIC_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      XAI_API_KEY: undefined,
      MISTRAL_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      AWS_REGION: undefined,
      AWS_DEFAULT_REGION: undefined,
      AWS_ACCESS_KEY_ID: undefined,
      AWS_SECRET_ACCESS_KEY: undefined,
      ELEVENLABS_API_KEY: undefined,
      EXA_API_KEY: undefined,
    });
  });
  afterEach(() => restoreEnv(snap));

  test('returns a non-empty string', () => {
    const msg = getFeatureStatusMessage();
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  test('warns when no LLM provider key is set', () => {
    const msg = getFeatureStatusMessage();
    expect(msg).toContain('No LLM provider API key set');
  });

  test('shows enabled when any LLM provider key is set', () => {
    process.env.MISTRAL_API_KEY = 'mistral-test';
    const msg = getFeatureStatusMessage();
    expect(msg).toContain('enabled');
  });

  test('shows AWS line', () => {
    const msg = getFeatureStatusMessage();
    expect(msg).toContain('AWS');
  });

  test('shows ElevenLabs when configured', () => {
    const snap2 = setEnv({ ELEVENLABS_API_KEY: 'el-key' });
    try {
      expect(getFeatureStatusMessage()).toContain('ElevenLabs');
    } finally {
      restoreEnv(snap2);
    }
  });
});

// ─── validateFeatureEnvVars ───────────────────────────────────────────────────

describe('validateFeatureEnvVars', () => {
  let snap: EnvSnapshot;

  beforeEach(() => {
    snap = setEnv({
      AWS_REGION: undefined,
      AWS_ACCESS_KEY_ID: undefined,
      AWS_SECRET_ACCESS_KEY: undefined,
      ELEVENLABS_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
    });
  });
  afterEach(() => restoreEnv(snap));

  test('no warnings for empty config', () => {
    expect(validateFeatureEnvVars({})).toHaveLength(0);
  });

  test('warns when inbox.enabled but no AWS credentials', () => {
    const warnings = validateFeatureEnvVars({ inbox: { enabled: true } });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('inbox');
    expect(warnings[0]).toContain('AWS');
  });

  test('warns when wallet.enabled but no AWS credentials', () => {
    const warnings = validateFeatureEnvVars({ wallet: { enabled: true } });
    expect(warnings.some(w => w.includes('wallet'))).toBe(true);
  });

  test('warns when secrets.enabled with aws provider but no AWS creds', () => {
    const warnings = validateFeatureEnvVars({
      secrets: { enabled: true, storage: { provider: 'aws' } },
    });
    expect(warnings.some(w => w.includes('secrets'))).toBe(true);
  });

  test('no secrets warning when provider is local', () => {
    const warnings = validateFeatureEnvVars({
      secrets: { enabled: true, storage: { provider: 'local' } },
    });
    expect(warnings.some(w => w.includes('secrets'))).toBe(false);
  });

  test('warns when voice elevenlabs but key missing', () => {
    const warnings = validateFeatureEnvVars({
      voice: { enabled: true, tts: { provider: 'elevenlabs' } },
    });
    expect(warnings.some(w => w.includes('elevenlabs'))).toBe(true);
  });

  test('warns when voice whisper but openai key missing', () => {
    const warnings = validateFeatureEnvVars({
      voice: { enabled: true, stt: { provider: 'whisper' } },
    });
    expect(warnings.some(w => w.includes('whisper'))).toBe(true);
  });

  test('no voice warnings when keys are present', () => {
    process.env.ELEVENLABS_API_KEY = 'el-key';
    process.env.OPENAI_API_KEY = 'sk-test';
    const warnings = validateFeatureEnvVars({
      voice: {
        enabled: true,
        tts: { provider: 'elevenlabs' },
        stt: { provider: 'whisper' },
      },
    });
    expect(warnings).toHaveLength(0);
  });

  test('no inbox warning when AWS is configured', () => {
    process.env.AWS_REGION = 'us-east-1';
    const warnings = validateFeatureEnvVars({ inbox: { enabled: true } });
    expect(warnings).toHaveLength(0);
  });

  test('no warning when feature is disabled', () => {
    // inbox.enabled = false → no warning even without AWS
    const warnings = validateFeatureEnvVars({ inbox: { enabled: false } });
    expect(warnings).toHaveLength(0);
  });
});
