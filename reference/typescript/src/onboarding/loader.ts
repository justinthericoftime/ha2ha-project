/**
 * HA2HA Profile Loader
 * 
 * Load and parse approver profiles from YAML files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { ApproverProfile, Ha2haConfig } from './types';
import { validateProfile } from './validator';

/**
 * Expand ~ to home directory
 */
function expandPath(filepath: string): string {
  if (filepath.startsWith('~')) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Get the default approvers directory
 */
export function getApproversDir(): string {
  return path.join(os.homedir(), '.openclaw', 'ha2ha', 'approvers');
}

/**
 * Get the default trust store directory
 */
export function getTrustStoreDir(): string {
  return path.join(os.homedir(), '.openclaw', 'ha2ha', 'trust-store');
}

/**
 * Load an approver profile from a YAML file
 */
export function loadProfile(filepath: string): ApproverProfile {
  const expanded = expandPath(filepath);
  
  if (!fs.existsSync(expanded)) {
    throw new Error(`Profile not found: ${expanded}`);
  }
  
  const content = fs.readFileSync(expanded, 'utf-8');
  const profile = yaml.load(content) as ApproverProfile;
  
  // Validate the loaded profile
  const result = validateProfile(profile);
  if (!result.valid) {
    const errorMessages = result.errors.map(e => `  ${e.path}: ${e.message}`).join('\n');
    throw new Error(`Invalid profile:\n${errorMessages}`);
  }
  
  return profile;
}

/**
 * List all profiles in the approvers directory
 */
export function listProfiles(): Array<{ id: string; path: string; name: string }> {
  const dir = getApproversDir();
  
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const profiles: Array<{ id: string; path: string; name: string }> = [];
  
  for (const file of files) {
    try {
      const filepath = path.join(dir, file);
      const profile = loadProfile(filepath);
      profiles.push({
        id: profile.approver.id,
        path: filepath,
        name: profile.approver.name,
      });
    } catch (e) {
      // Skip invalid profiles
      console.warn(`Skipping invalid profile: ${file}`);
    }
  }
  
  return profiles;
}

/**
 * Load HA2HA config from OpenClaw config
 */
export function loadHa2haConfig(openclawConfigPath?: string): Ha2haConfig | null {
  const configPath = openclawConfigPath || path.join(os.homedir(), '.openclaw', 'openclaw.json');
  
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    return config.ha2ha || null;
  } catch (e) {
    console.warn('Failed to load OpenClaw config:', e);
    return null;
  }
}

/**
 * Load the active approver profile based on OpenClaw config
 */
export function loadActiveProfile(openclawConfigPath?: string): ApproverProfile | null {
  const ha2haConfig = loadHa2haConfig(openclawConfigPath);
  
  if (!ha2haConfig || !ha2haConfig.enabled || !ha2haConfig.profile) {
    return null;
  }
  
  try {
    return loadProfile(ha2haConfig.profile);
  } catch (e) {
    console.warn('Failed to load active profile:', e);
    return null;
  }
}

/**
 * Check if a profile exists for the given ID
 */
export function profileExists(id: string): boolean {
  const filepath = path.join(getApproversDir(), `${id}.yaml`);
  return fs.existsSync(filepath);
}

/**
 * Save a profile to the approvers directory
 */
export function saveProfile(profile: ApproverProfile): string {
  const dir = getApproversDir();
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const filepath = path.join(dir, `${profile.approver.id}.yaml`);
  const content = yaml.dump(profile, { 
    indent: 2,
    lineWidth: 120,
    quotingType: '"',
  });
  
  // Add header comment
  const header = `# HA2HA Human Approver Profile\n# Generated: ${profile.approver.created}\n\n`;
  fs.writeFileSync(filepath, header + content, 'utf-8');
  
  return filepath;
}

/**
 * Delete a profile
 */
export function deleteProfile(id: string): boolean {
  const filepath = path.join(getApproversDir(), `${id}.yaml`);
  
  if (!fs.existsSync(filepath)) {
    return false;
  }
  
  fs.unlinkSync(filepath);
  return true;
}
