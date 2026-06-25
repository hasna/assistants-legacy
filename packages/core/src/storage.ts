import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { hostname, tmpdir } from 'os';
import { dirname, join } from 'path';
import { getConfigDir } from './config';
import {
  closeDatabase,
  getDatabasePath,
  resetDatabaseSingleton,
} from './database';
import { getBackupsDir } from './database/backup';
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from './database/schema';
import { getRuntime, hasRuntime } from './runtime';

export const ASSISTANTS_STORAGE_ENV = {
  mode: 'HASNA_ASSISTANTS_STORAGE_MODE',
  s3Bucket: 'HASNA_ASSISTANTS_S3_BUCKET',
  s3Prefix: 'HASNA_ASSISTANTS_S3_PREFIX',
  awsRegion: 'HASNA_ASSISTANTS_AWS_REGION',
  s3Endpoint: 'HASNA_ASSISTANTS_S3_ENDPOINT',
  s3ForcePathStyle: 'HASNA_ASSISTANTS_S3_FORCE_PATH_STYLE',
  machineId: 'HASNA_ASSISTANTS_MACHINE_ID',
  dbPath: 'HASNA_ASSISTANTS_DB_PATH',
} as const;

export const ASSISTANTS_STORAGE_FALLBACK_ENV = {
  mode: 'ASSISTANTS_STORAGE_MODE',
  s3Bucket: 'ASSISTANTS_S3_BUCKET',
  s3Prefix: 'ASSISTANTS_S3_PREFIX',
  awsRegion: 'ASSISTANTS_AWS_REGION',
  s3Endpoint: 'ASSISTANTS_S3_ENDPOINT',
  s3ForcePathStyle: 'ASSISTANTS_S3_FORCE_PATH_STYLE',
  machineId: 'ASSISTANTS_MACHINE_ID',
  dbPath: 'ASSISTANTS_DB_PATH',
} as const;

export const STORAGE_MODE_ENV = ASSISTANTS_STORAGE_ENV.mode;

export const STORAGE_TABLES = Object.freeze(
  Array.from(new Set(
    SCHEMA_STATEMENTS
      .map((sql) => sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_]+)/i)?.[1])
      .filter((name): name is string => Boolean(name))
  ))
);

export type AssistantsStorageMode = 'local' | 'remote' | 'hybrid';

export interface AssistantsStorageConfig {
  mode: AssistantsStorageMode;
  configDir: string;
  dbPath: string;
  s3Bucket?: string;
  s3Prefix: string;
  awsRegion?: string;
  s3Endpoint?: string;
  s3ForcePathStyle?: boolean;
  machineId: string;
}

export interface AssistantsStorageStatus {
  configured: boolean;
  mode: AssistantsStorageMode;
  schemaVersion: number;
  local: {
    configDir: string;
    dbPath: string;
    dbExists: boolean;
    dbSizeBytes: number;
    walExists: boolean;
    shmExists: boolean;
    backupsDir: string;
    backupCount: number;
  };
  remote: {
    configured: boolean;
    bucketEnv: string;
    bucket?: string;
    prefix: string;
    regionEnv: string;
    endpointConfigured: boolean;
  };
  env: typeof ASSISTANTS_STORAGE_ENV;
  fallbackEnv: typeof ASSISTANTS_STORAGE_FALLBACK_ENV;
  tables: readonly string[];
}

export interface AssistantsStorageSnapshot {
  schemaVersion: 1;
  source: 'assistants';
  createdAt: string;
  machineId: string;
  path: string;
  sourcePath: string;
  sizeBytes: number;
}

export interface CreateAssistantsStorageSnapshotOptions {
  path?: string;
}

export interface AssistantsStorageSyncResult {
  mode: AssistantsStorageMode;
  pushed: number;
  pulled: number;
  skipped: boolean;
  key: string;
  reason?: string;
  localPath?: string;
  backupPath?: string;
  sizeBytes?: number;
}

function firstEnv(env: NodeJS.ProcessEnv, primary: string, fallback: string): string | undefined {
  return env[primary] || env[fallback] || undefined;
}

function parseMode(value: string | undefined): AssistantsStorageMode {
  if (value === 'remote' || value === 's3') return 'remote';
  if (value === 'hybrid') return 'hybrid';
  return 'local';
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  if (['1', 'true', 'yes'].includes(value.toLowerCase())) return true;
  if (['0', 'false', 'no'].includes(value.toLowerCase())) return false;
  return undefined;
}

function normalizePrefix(prefix: string | undefined): string {
  if (!prefix) return 'assistants/';
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function statSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function countBackups(path: string): number {
  try {
    return readdirSync(path).filter((file) => file.endsWith('.db')).length;
  } catch {
    return 0;
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sqliteLiteral(path: string): string {
  return path.replace(/'/g, "''");
}

function createSqliteSnapshot(sourcePath: string, destinationPath: string): void {
  mkdirSync(dirname(destinationPath), { recursive: true });

  if (hasRuntime()) {
    const db = getRuntime().openDatabase(sourcePath);
    try {
      db.exec(`VACUUM INTO '${sqliteLiteral(destinationPath)}'`);
    } finally {
      db.close();
    }
    return;
  }

  copyFileSync(sourcePath, destinationPath);
}

export function getAssistantsStorageConfig(env: NodeJS.ProcessEnv = process.env): AssistantsStorageConfig {
  const configDir = getConfigDir();
  return {
    mode: parseMode(firstEnv(env, ASSISTANTS_STORAGE_ENV.mode, ASSISTANTS_STORAGE_FALLBACK_ENV.mode)),
    configDir,
    dbPath: firstEnv(env, ASSISTANTS_STORAGE_ENV.dbPath, ASSISTANTS_STORAGE_FALLBACK_ENV.dbPath) ?? getDatabasePath(configDir),
    s3Bucket: firstEnv(env, ASSISTANTS_STORAGE_ENV.s3Bucket, ASSISTANTS_STORAGE_FALLBACK_ENV.s3Bucket),
    s3Prefix: normalizePrefix(firstEnv(env, ASSISTANTS_STORAGE_ENV.s3Prefix, ASSISTANTS_STORAGE_FALLBACK_ENV.s3Prefix)),
    awsRegion: firstEnv(env, ASSISTANTS_STORAGE_ENV.awsRegion, ASSISTANTS_STORAGE_FALLBACK_ENV.awsRegion) ?? env.AWS_REGION,
    s3Endpoint: firstEnv(env, ASSISTANTS_STORAGE_ENV.s3Endpoint, ASSISTANTS_STORAGE_FALLBACK_ENV.s3Endpoint),
    s3ForcePathStyle: parseBoolean(firstEnv(
      env,
      ASSISTANTS_STORAGE_ENV.s3ForcePathStyle,
      ASSISTANTS_STORAGE_FALLBACK_ENV.s3ForcePathStyle
    )),
    machineId: firstEnv(env, ASSISTANTS_STORAGE_ENV.machineId, ASSISTANTS_STORAGE_FALLBACK_ENV.machineId) ?? hostname(),
  };
}

export function getAssistantsStorageStatus(env: NodeJS.ProcessEnv = process.env): AssistantsStorageStatus {
  const config = getAssistantsStorageConfig(env);
  const backupsDir = getBackupsDir(config.configDir);
  const hasPrimaryBucket = Boolean(env[ASSISTANTS_STORAGE_ENV.s3Bucket]);
  const hasPrimaryRegion = Boolean(env[ASSISTANTS_STORAGE_ENV.awsRegion]);

  return {
    configured: config.mode === 'local' || Boolean(config.s3Bucket),
    mode: config.mode,
    schemaVersion: SCHEMA_VERSION,
    local: {
      configDir: config.configDir,
      dbPath: config.dbPath,
      dbExists: existsSync(config.dbPath),
      dbSizeBytes: statSize(config.dbPath),
      walExists: existsSync(`${config.dbPath}-wal`),
      shmExists: existsSync(`${config.dbPath}-shm`),
      backupsDir,
      backupCount: countBackups(backupsDir),
    },
    remote: {
      configured: Boolean(config.s3Bucket),
      bucketEnv: hasPrimaryBucket ? ASSISTANTS_STORAGE_ENV.s3Bucket : ASSISTANTS_STORAGE_FALLBACK_ENV.s3Bucket,
      bucket: config.s3Bucket,
      prefix: config.s3Prefix,
      regionEnv: hasPrimaryRegion ? ASSISTANTS_STORAGE_ENV.awsRegion : ASSISTANTS_STORAGE_FALLBACK_ENV.awsRegion,
      endpointConfigured: Boolean(config.s3Endpoint),
    },
    env: ASSISTANTS_STORAGE_ENV,
    fallbackEnv: ASSISTANTS_STORAGE_FALLBACK_ENV,
    tables: STORAGE_TABLES,
  };
}

export function assistantsStorageSnapshotKey(env: NodeJS.ProcessEnv = process.env): string {
  const config = getAssistantsStorageConfig(env);
  return `${config.s3Prefix}assistants.db`;
}

export function createAssistantsStorageSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  options: CreateAssistantsStorageSnapshotOptions = {}
): AssistantsStorageSnapshot {
  const config = getAssistantsStorageConfig(env);
  if (!existsSync(config.dbPath)) {
    throw new Error(`assistants database not found at ${config.dbPath}`);
  }

  const destinationPath = options.path ?? join(
    getBackupsDir(config.configDir),
    `assistants-storage-${timestamp()}.db`
  );

  createSqliteSnapshot(config.dbPath, destinationPath);

  return {
    schemaVersion: 1,
    source: 'assistants',
    createdAt: new Date().toISOString(),
    machineId: config.machineId,
    path: destinationPath,
    sourcePath: config.dbPath,
    sizeBytes: statSize(destinationPath),
  };
}

async function getS3Client(config: AssistantsStorageConfig) {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: config.awsRegion,
    endpoint: config.s3Endpoint,
    forcePathStyle: config.s3ForcePathStyle,
  });
}

async function bodyToBytes(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body && typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === 'function') {
    return (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
  }
  if (body && typeof (body as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === 'function') {
    return new Uint8Array(await (body as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer());
  }
  if (body && Symbol.asyncIterator in Object(body)) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error('unsupported S3 response body');
}

export async function storagePush(env: NodeJS.ProcessEnv = process.env): Promise<AssistantsStorageSyncResult> {
  const config = getAssistantsStorageConfig(env);
  const key = assistantsStorageSnapshotKey(env);
  if (!config.s3Bucket) {
    return { mode: config.mode, pushed: 0, pulled: 0, skipped: true, key, reason: 'S3 bucket is not configured' };
  }
  if (!existsSync(config.dbPath)) {
    return { mode: config.mode, pushed: 0, pulled: 0, skipped: true, key, reason: `assistants database not found at ${config.dbPath}` };
  }

  const tmpDir = join(tmpdir(), `assistants-storage-${process.pid}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const snapshotPath = join(tmpDir, 'assistants.db');

  try {
    const snapshot = createAssistantsStorageSnapshot(env, { path: snapshotPath });
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client(config);
    await client.send(new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: readFileSync(snapshot.path),
      ContentType: 'application/x-sqlite3',
      Metadata: {
        source: snapshot.source,
        machine: snapshot.machineId,
        createdAt: snapshot.createdAt,
      },
    }));

    return {
      mode: config.mode,
      pushed: 1,
      pulled: 0,
      skipped: false,
      key,
      localPath: config.dbPath,
      sizeBytes: snapshot.sizeBytes,
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function storagePull(env: NodeJS.ProcessEnv = process.env): Promise<AssistantsStorageSyncResult> {
  const config = getAssistantsStorageConfig(env);
  const key = assistantsStorageSnapshotKey(env);
  if (!config.s3Bucket) {
    return { mode: config.mode, pushed: 0, pulled: 0, skipped: true, key, reason: 'S3 bucket is not configured' };
  }

  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getS3Client(config);
  const result = await client.send(new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
  }));
  const bytes = await bodyToBytes(result.Body);

  closeDatabase();
  resetDatabaseSingleton();
  mkdirSync(dirname(config.dbPath), { recursive: true });

  let backupPath: string | undefined;
  if (existsSync(config.dbPath)) {
    backupPath = join(getBackupsDir(config.configDir), `assistants-before-pull-${timestamp()}.db`);
    mkdirSync(dirname(backupPath), { recursive: true });
    copyFileSync(config.dbPath, backupPath);
  }

  rmSync(`${config.dbPath}-wal`, { force: true });
  rmSync(`${config.dbPath}-shm`, { force: true });

  const tmpPath = `${config.dbPath}.download-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, bytes, { mode: 0o600 });
  renameSync(tmpPath, config.dbPath);

  return {
    mode: config.mode,
    pushed: 0,
    pulled: 1,
    skipped: false,
    key,
    localPath: config.dbPath,
    backupPath,
    sizeBytes: bytes.byteLength,
  };
}

export async function storageSync(env: NodeJS.ProcessEnv = process.env): Promise<AssistantsStorageSyncResult> {
  return storagePush(env);
}

export const getStorageStatus = getAssistantsStorageStatus;
