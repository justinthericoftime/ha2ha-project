/**
 * Trust Persistence Layer
 * 
 * Handles saving and loading trust state to/from JSON files.
 * Uses atomic writes and backup to prevent corruption.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TrustStoreData,
  TrustEntryData,
} from './types';

/** Current schema version */
const SCHEMA_VERSION = 1;

/**
 * Default trust store path
 */
export function getDefaultStorePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return path.join(home, '.openclaw', 'ha2ha', 'trust-store', 'agents.json');
}

/**
 * Ensure directory exists for a file path
 */
export function ensureDirectory(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create an empty trust store
 */
export function createEmptyStore(): TrustStoreData {
  return {
    version: SCHEMA_VERSION,
    lastUpdated: new Date().toISOString(),
    agents: {},
  };
}

/**
 * Load trust store from file
 * Returns empty store if file doesn't exist
 */
export async function loadTrustStore(storePath: string): Promise<TrustStoreData> {
  try {
    if (!fs.existsSync(storePath)) {
      return createEmptyStore();
    }

    const content = await fs.promises.readFile(storePath, 'utf-8');
    const data = JSON.parse(content) as TrustStoreData;

    // Validate schema version
    if (data.version !== SCHEMA_VERSION) {
      // Future: implement migrations
      console.warn(`Trust store schema version ${data.version} differs from current ${SCHEMA_VERSION}`);
    }

    return data;
  } catch (error) {
    // If main file is corrupted, try backup
    const backupPath = storePath + '.backup';
    if (fs.existsSync(backupPath)) {
      console.warn('Main trust store corrupted, loading from backup');
      const content = await fs.promises.readFile(backupPath, 'utf-8');
      return JSON.parse(content) as TrustStoreData;
    }

    // No backup, return empty
    console.error('Failed to load trust store:', error);
    return createEmptyStore();
  }
}

/**
 * Save trust store to file
 * Uses atomic write pattern with backup
 */
export async function saveTrustStore(storePath: string, data: TrustStoreData): Promise<void> {
  ensureDirectory(storePath);

  // Update timestamp
  data.lastUpdated = new Date().toISOString();

  // Create backup of existing file
  if (fs.existsSync(storePath)) {
    const backupPath = storePath + '.backup';
    await fs.promises.copyFile(storePath, backupPath);
  }

  // Write to temp file first (atomic write pattern)
  const tempPath = storePath + '.tmp';
  const content = JSON.stringify(data, null, 2);
  await fs.promises.writeFile(tempPath, content, 'utf-8');

  // Rename temp to final (atomic on most filesystems)
  await fs.promises.rename(tempPath, storePath);
}

/**
 * Add or update a trust entry in the store
 */
export function setTrustEntry(store: TrustStoreData, entry: TrustEntryData): void {
  store.agents[entry.agentId] = entry;
}

/**
 * Get a trust entry from the store
 */
export function getTrustEntry(store: TrustStoreData, agentId: string): TrustEntryData | undefined {
  return store.agents[agentId];
}

/**
 * Remove a trust entry from the store
 */
export function removeTrustEntry(store: TrustStoreData, agentId: string): boolean {
  if (store.agents[agentId]) {
    delete store.agents[agentId];
    return true;
  }
  return false;
}

/**
 * List all agent IDs in the store
 */
export function listAgentIds(store: TrustStoreData): string[] {
  return Object.keys(store.agents);
}

/**
 * Get all trust entries from the store
 */
export function getAllEntries(store: TrustStoreData): TrustEntryData[] {
  return Object.values(store.agents);
}

/**
 * Synchronous version of loadTrustStore for simple use cases
 */
export function loadTrustStoreSync(storePath: string): TrustStoreData {
  try {
    if (!fs.existsSync(storePath)) {
      return createEmptyStore();
    }

    const content = fs.readFileSync(storePath, 'utf-8');
    const data = JSON.parse(content) as TrustStoreData;
    return data;
  } catch (error) {
    const backupPath = storePath + '.backup';
    if (fs.existsSync(backupPath)) {
      const content = fs.readFileSync(backupPath, 'utf-8');
      return JSON.parse(content) as TrustStoreData;
    }
    return createEmptyStore();
  }
}

/**
 * Synchronous version of saveTrustStore for simple use cases
 */
export function saveTrustStoreSync(storePath: string, data: TrustStoreData): void {
  ensureDirectory(storePath);
  data.lastUpdated = new Date().toISOString();

  if (fs.existsSync(storePath)) {
    const backupPath = storePath + '.backup';
    fs.copyFileSync(storePath, backupPath);
  }

  const tempPath = storePath + '.tmp';
  const content = JSON.stringify(data, null, 2);
  fs.writeFileSync(tempPath, content, 'utf-8');
  fs.renameSync(tempPath, storePath);
}
