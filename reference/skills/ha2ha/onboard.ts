#!/usr/bin/env npx ts-node
/**
 * HA2HA Human Approver Onboarding Script
 * 
 * Interactive CLI for creating approver profiles.
 * Can also be invoked programmatically.
 * 
 * Usage:
 *   npx ts-node onboard.ts
 *   npx ts-node onboard.ts --reset
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

interface ApproverProfile {
  approver: {
    name: string;
    id: string;
    created: string;
  };
  identity: {
    model: 'channel-based' | 'multi-factor' | 'token';
    verification: 'simple' | 'moderate' | 'strict';
    channels?: Array<{
      type: string;
      authenticated: boolean;
      identifier?: string;
    }>;
  };
  authorization: {
    domains: string[];
    availability: {
      mode: 'always' | 'waking-hours' | 'scheduled';
      enforcement: 'soft' | 'strict';
    };
    off_hours_behavior: 'queue' | 'deny' | 'escalate';
  };
  approval_preferences: {
    presentation: 'inline' | 'batched' | 'both';
    fatigue_limit: number | null;
    batching: boolean;
  };
  trust_baseline: {
    default_level: 'blocked' | 'unknown' | 'provisional';
    pre_trusted: Array<{
      name: string;
      relationship?: string;
      level: 'provisional' | 'standard' | 'trusted';
      domains: string[];
    }>;
  };
  recovery: {
    delegation: null | Array<{ name: string; contact?: string; domains?: string[] }>;
    timeout_hours: number;
    timeout_action: 'deny' | 'escalate' | 'hold';
  };
}

interface OnboardingAnswers {
  // Step 1: Identity
  name: string;
  identityModel: 'channel-based' | 'multi-factor' | 'token';
  verification: 'simple' | 'moderate' | 'strict';
  
  // Step 2: Registration
  domains: string[];
  availabilityMode: 'always' | 'waking-hours' | 'scheduled';
  
  // Step 3: Preferences
  presentation: 'inline' | 'batched' | 'both';
  fatigueLimit: number | null;
  
  // Step 4: Trust
  defaultTrust: 'blocked' | 'unknown' | 'provisional';
  preTrusted: Array<{ name: string; relationship?: string }>;
  
  // Step 5: Recovery
  hasDelegation: boolean;
  delegates: Array<{ name: string }>;
  timeoutHours: number;
  timeoutAction: 'deny' | 'escalate' | 'hold';
}

// ============================================================================
// Onboarding Flow
// ============================================================================

const SIGNPOST = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                        HA2HA Human Onboarding                                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  This onboarding has 5 steps and 10 questions.                               ║
║  It takes about 10 minutes.                                                  ║
║                                                                              ║
║  Here's what we'll cover:                                                    ║
║    Step 1: Identity ........... How are you identified and verified?        ║
║    Step 2: Registration ....... What can you approve, and when?             ║
║    Step 3: Preferences ........ How should requests be presented?           ║
║    Step 4: Trust Baseline ..... What's your default stance?                 ║
║    Step 5: Recovery ........... What happens when you're unavailable?       ║
╚══════════════════════════════════════════════════════════════════════════════╝
`;

const QUESTIONS = {
  // Step 1
  name: 'What is your name? (This will identify your approver profile)',
  identityModel: `
How should agents verify your identity?
  a) Channel-based — If it comes through your authenticated channels, it's you
  b) Multi-factor — Require confirmation on a second channel
  c) Token — Use cryptographic tokens for verification

Enter a, b, or c:`,
  
  verification: `
When a remote agent claims authorization from you, what proof should be required?
  a) Simple — Message from a verified channel is sufficient
  b) Moderate — Require confirmation on a second channel
  c) Strict — Require in-session approval with your agent

Enter a, b, or c:`,

  // Step 2
  domains: `
What domains can you approve? (Examples: *, technical/*, financial/*)
Enter * for everything, or comma-separated domains:`,

  availability: `
When are you available for approval requests?
  a) Always — 24/7, ping me whenever
  b) Waking hours — Use judgment, queue overnight
  c) Scheduled — Specific hours only

Enter a, b, or c:`,

  // Step 3
  presentation: `
How should approval requests be presented?
  a) Inline — Show me immediately in conversation
  b) Batched — Group similar requests and show periodically
  c) Both — Urgent inline, routine batched

Enter a, b, or c:`,

  fatigueLimit: `
Should I enforce an approval fatigue limit? (Recommended: 5/hour)
Enter a number (max approvals per hour), or press Enter for no limit:`,

  // Step 4
  defaultTrust: `
What's your default trust level for unknown agents?
  a) Blocked — Reject all requests from unknowns
  b) Unknown — Accept requests for review, require approval for actions
  c) Provisional — Allow low-risk interactions, approval for sensitive actions

Enter a, b, or c:`,

  preTrusted: `
Are there any people whose agents should start with elevated trust?
Enter comma-separated names, or press Enter for none:`,

  // Step 5
  timeoutHours: `
If a request sits unapproved, after how many hours should it auto-deny?
Enter a number (recommended: 5):`,

  delegation: `
Should anyone else be able to approve in your absence?
Enter comma-separated names, or press Enter for no delegation:`,
};

// ============================================================================
// CLI Helpers
// ============================================================================

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question + ' ', (answer) => {
      resolve(answer.trim());
    });
  });
}

function parseChoice(input: string, options: string[]): string | null {
  const lower = input.toLowerCase();
  if (options.includes(lower)) {
    return lower;
  }
  return null;
}

function toKebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============================================================================
// Profile Generation
// ============================================================================

function generateProfile(answers: OnboardingAnswers): ApproverProfile {
  const id = toKebabCase(answers.name);
  
  return {
    approver: {
      name: answers.name,
      id,
      created: new Date().toISOString(),
    },
    identity: {
      model: answers.identityModel,
      verification: answers.verification,
      channels: answers.identityModel === 'channel-based' 
        ? [{ type: 'openclaw-session', authenticated: true }]
        : undefined,
    },
    authorization: {
      domains: answers.domains,
      availability: {
        mode: answers.availabilityMode,
        enforcement: 'soft',
      },
      off_hours_behavior: 'queue',
    },
    approval_preferences: {
      presentation: answers.presentation,
      fatigue_limit: answers.fatigueLimit,
      batching: answers.presentation === 'batched' || answers.presentation === 'both',
    },
    trust_baseline: {
      default_level: answers.defaultTrust,
      pre_trusted: answers.preTrusted.map(pt => ({
        name: pt.name,
        relationship: pt.relationship,
        level: 'provisional' as const,
        domains: ['*'],
      })),
    },
    recovery: {
      delegation: answers.hasDelegation 
        ? answers.delegates.map(d => ({ name: d.name }))
        : null,
      timeout_hours: answers.timeoutHours,
      timeout_action: answers.timeoutAction,
    },
  };
}

function profileToYaml(profile: ApproverProfile): string {
  const lines: string[] = [
    '# HA2HA Human Approver Profile',
    `# Generated: ${profile.approver.created}`,
    '',
    'approver:',
    `  name: "${profile.approver.name}"`,
    `  id: "${profile.approver.id}"`,
    `  created: "${profile.approver.created}"`,
    '',
    'identity:',
    `  model: "${profile.identity.model}"`,
    `  verification: "${profile.identity.verification}"`,
  ];
  
  if (profile.identity.channels) {
    lines.push('  channels:');
    for (const ch of profile.identity.channels) {
      lines.push(`    - type: "${ch.type}"`);
      lines.push(`      authenticated: ${ch.authenticated}`);
    }
  }
  
  lines.push('');
  lines.push('authorization:');
  lines.push(`  domains: [${profile.authorization.domains.map(d => `"${d}"`).join(', ')}]`);
  lines.push('  availability:');
  lines.push(`    mode: "${profile.authorization.availability.mode}"`);
  lines.push(`    enforcement: "${profile.authorization.availability.enforcement}"`);
  lines.push(`  off_hours_behavior: "${profile.authorization.off_hours_behavior}"`);
  
  lines.push('');
  lines.push('approval_preferences:');
  lines.push(`  presentation: "${profile.approval_preferences.presentation}"`);
  lines.push(`  fatigue_limit: ${profile.approval_preferences.fatigue_limit ?? 'null'}`);
  lines.push(`  batching: ${profile.approval_preferences.batching}`);
  
  lines.push('');
  lines.push('trust_baseline:');
  lines.push(`  default_level: "${profile.trust_baseline.default_level}"`);
  
  if (profile.trust_baseline.pre_trusted.length > 0) {
    lines.push('  pre_trusted:');
    for (const pt of profile.trust_baseline.pre_trusted) {
      lines.push(`    - name: "${pt.name}"`);
      if (pt.relationship) {
        lines.push(`      relationship: "${pt.relationship}"`);
      }
      lines.push(`      level: "${pt.level}"`);
      lines.push(`      domains: [${pt.domains.map(d => `"${d}"`).join(', ')}]`);
    }
  } else {
    lines.push('  pre_trusted: []');
  }
  
  lines.push('');
  lines.push('recovery:');
  
  if (profile.recovery.delegation) {
    lines.push('  delegation:');
    for (const d of profile.recovery.delegation) {
      lines.push(`    - name: "${d.name}"`);
    }
  } else {
    lines.push('  delegation: null');
  }
  
  lines.push(`  timeout_hours: ${profile.recovery.timeout_hours}`);
  lines.push(`  timeout_action: "${profile.recovery.timeout_action}"`);
  
  return lines.join('\n') + '\n';
}

// ============================================================================
// File Operations
// ============================================================================

function getProfileDir(): string {
  const home = os.homedir();
  return path.join(home, '.openclaw', 'ha2ha', 'approvers');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function saveProfile(profile: ApproverProfile): string {
  const dir = getProfileDir();
  ensureDir(dir);
  
  const filename = `${profile.approver.id}.yaml`;
  const filepath = path.join(dir, filename);
  
  fs.writeFileSync(filepath, profileToYaml(profile), 'utf-8');
  
  return filepath;
}

// ============================================================================
// Main Flow
// ============================================================================

async function runOnboarding(): Promise<void> {
  console.log(SIGNPOST);
  
  const rl = createReadline();
  const answers: Partial<OnboardingAnswers> = {};
  
  try {
    // Step 1: Identity
    console.log('\n━━━ Step 1 of 5: Identity ━━━\n');
    
    answers.name = await ask(rl, QUESTIONS.name);
    if (!answers.name) {
      console.log('Name is required. Exiting.');
      process.exit(1);
    }
    
    let choice = await ask(rl, QUESTIONS.identityModel);
    answers.identityModel = ({ a: 'channel-based', b: 'multi-factor', c: 'token' } as const)[choice as 'a'|'b'|'c'] || 'channel-based';
    
    choice = await ask(rl, QUESTIONS.verification);
    answers.verification = ({ a: 'simple', b: 'moderate', c: 'strict' } as const)[choice as 'a'|'b'|'c'] || 'simple';
    
    // Step 2: Registration
    console.log('\n━━━ Step 2 of 5: Registration ━━━\n');
    
    const domainsInput = await ask(rl, QUESTIONS.domains);
    answers.domains = domainsInput ? domainsInput.split(',').map(d => d.trim()) : ['*'];
    
    choice = await ask(rl, QUESTIONS.availability);
    answers.availabilityMode = ({ a: 'always', b: 'waking-hours', c: 'scheduled' } as const)[choice as 'a'|'b'|'c'] || 'waking-hours';
    
    // Step 3: Preferences
    console.log('\n━━━ Step 3 of 5: Preferences ━━━\n');
    
    choice = await ask(rl, QUESTIONS.presentation);
    answers.presentation = ({ a: 'inline', b: 'batched', c: 'both' } as const)[choice as 'a'|'b'|'c'] || 'inline';
    
    const limitInput = await ask(rl, QUESTIONS.fatigueLimit);
    answers.fatigueLimit = limitInput ? parseInt(limitInput, 10) : null;
    
    // Step 4: Trust
    console.log('\n━━━ Step 4 of 5: Trust Baseline ━━━\n');
    
    choice = await ask(rl, QUESTIONS.defaultTrust);
    answers.defaultTrust = ({ a: 'blocked', b: 'unknown', c: 'provisional' } as const)[choice as 'a'|'b'|'c'] || 'unknown';
    
    const trustedInput = await ask(rl, QUESTIONS.preTrusted);
    answers.preTrusted = trustedInput 
      ? trustedInput.split(',').map(n => ({ name: n.trim() }))
      : [];
    
    // Step 5: Recovery
    console.log('\n━━━ Step 5 of 5: Recovery ━━━\n');
    
    const timeoutInput = await ask(rl, QUESTIONS.timeoutHours);
    answers.timeoutHours = parseInt(timeoutInput, 10) || 5;
    answers.timeoutAction = 'deny'; // Default fail-secure
    
    const delegatesInput = await ask(rl, QUESTIONS.delegation);
    answers.hasDelegation = !!delegatesInput;
    answers.delegates = delegatesInput 
      ? delegatesInput.split(',').map(n => ({ name: n.trim() }))
      : [];
    
    // Generate and save
    console.log('\n━━━ Generating Profile ━━━\n');
    
    const profile = generateProfile(answers as OnboardingAnswers);
    const filepath = saveProfile(profile);
    
    console.log(`✅ Profile saved to: ${filepath}`);
    console.log('\nYour HA2HA approver profile is ready.');
    console.log('Add the following to your openclaw.json:\n');
    console.log(JSON.stringify({
      ha2ha: {
        enabled: true,
        profile: filepath,
        trustStore: path.join(path.dirname(filepath), '..', 'trust-store'),
      }
    }, null, 2));
    
  } finally {
    rl.close();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

if (require.main === module) {
  runOnboarding().catch((err) => {
    console.error('Onboarding failed:', err);
    process.exit(1);
  });
}

export { runOnboarding, generateProfile, profileToYaml, ApproverProfile, OnboardingAnswers };
