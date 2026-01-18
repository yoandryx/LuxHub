#!/usr/bin/env node

/**
 * Environment Validator Agent
 * Validates that all required environment variables are set
 * and checks connectivity to external services
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// Environment variable requirements
const envRequirements = {
  critical: [
    {
      name: 'NEXT_PUBLIC_SOLANA_ENDPOINT',
      description: 'Solana RPC endpoint',
      validator: (val) => val.startsWith('http'),
    },
    {
      name: 'PROGRAM_ID',
      description: 'Deployed Anchor program ID',
      validator: (val) => val.length >= 32,
    },
    {
      name: 'MONGODB_URI',
      description: 'MongoDB connection string',
      validator: (val) => val.startsWith('mongodb'),
    },
    {
      name: 'JWT_SECRET',
      description: 'JWT signing secret',
      validator: (val) => val.length >= 16 && val !== 'your_secret_key_here',
    },
  ],
  required: [
    {
      name: 'PINATA_API_KEY',
      description: 'Pinata API key for IPFS',
      validator: (val) => val.length > 0,
    },
    {
      name: 'PINATA_API_SECRET_KEY',
      description: 'Pinata API secret',
      validator: (val) => val.length > 0,
    },
    {
      name: 'NEXT_PUBLIC_LUXHUB_WALLET',
      description: 'Treasury wallet address',
      validator: (val) => val.length >= 32,
    },
    {
      name: 'NEXT_PUBLIC_GATEWAY_URL',
      description: 'IPFS gateway URL',
      validator: (val) => val.startsWith('http'),
    },
  ],
  optional: [
    { name: 'HELIUS_API_KEY', description: 'Helius RPC API key' },
    { name: 'HELIUS_ENDPOINT', description: 'Helius RPC endpoint' },
    { name: 'EDGE_CONFIG', description: 'Vercel Edge Config' },
    { name: 'NEXT_PUBLIC_SQUADS_MSIG', description: 'Squads multisig address' },
    { name: 'SQUADS_MEMBER_KEYPAIR_PATH', description: 'Squads member keypair path' },
    { name: 'NEXT_PUBLIC_CANDY_MACHINE_ID', description: 'Candy Machine ID' },
    { name: 'NEXT_PUBLIC_PRIVY_APP_ID', description: 'Privy App ID' },
    { name: 'IBM_COS_API_KEY', description: 'IBM Cloud Object Storage API key' },
    { name: 'IBM_COS_RESOURCE_INSTANCE_ID', description: 'IBM COS resource instance' },
    { name: 'XAI_API_KEY', description: 'xAI API key' },
  ],
};

// Secret patterns to detect hardcoded secrets
const secretPatterns = [
  { name: 'API Key', pattern: /[a-zA-Z0-9]{32,}/ },
  { name: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+/ },
  { name: 'MongoDB URI with password', pattern: /mongodb\+srv:\/\/[^:]+:[^@]+@/ },
];

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');

  if (!fs.existsSync(envPath)) {
    console.log(`${colors.yellow}Warning: .env.local not found, using process.env${colors.reset}`);
    return process.env;
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const envVars = { ...process.env };

  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        let value = valueParts.join('=');
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        envVars[key] = value;
      }
    }
  });

  return envVars;
}

function validateEnvVar(envVars, requirement) {
  const value = envVars[requirement.name];

  if (!value) {
    return { status: 'missing', message: 'Not set' };
  }

  if (requirement.validator && !requirement.validator(value)) {
    return { status: 'invalid', message: 'Invalid format or value' };
  }

  return { status: 'valid', message: 'OK' };
}

function printSection(title) {
  console.log(`\n${colors.bold}${colors.cyan}${title}${colors.reset}`);
  console.log('─'.repeat(50));
}

function printResult(name, description, result) {
  const statusIcon = {
    valid: `${colors.green}✓${colors.reset}`,
    missing: `${colors.red}✗${colors.reset}`,
    invalid: `${colors.yellow}!${colors.reset}`,
  };

  const icon = statusIcon[result.status] || '?';
  const color = result.status === 'valid' ? colors.green :
                result.status === 'missing' ? colors.red : colors.yellow;

  console.log(`  ${icon} ${name}`);
  console.log(`    ${colors.blue}${description}${colors.reset}`);
  if (result.status !== 'valid') {
    console.log(`    ${color}${result.message}${colors.reset}`);
  }
}

async function checkSolanaConnection(endpoint) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth',
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.result === 'ok' || data.result;
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function checkMongoConnection(uri) {
  // We can't directly test MongoDB from here without mongoose
  // Just validate the URI format
  return uri && uri.startsWith('mongodb');
}

async function main() {
  console.log(`\n${colors.bold}${colors.blue}╔════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}║       LuxHub Environment Validator             ║${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}╚════════════════════════════════════════════════╝${colors.reset}`);

  const envVars = loadEnvFile();
  let criticalErrors = 0;
  let warnings = 0;

  // Validate critical variables
  printSection('Critical Variables (Required)');
  for (const req of envRequirements.critical) {
    const result = validateEnvVar(envVars, req);
    printResult(req.name, req.description, result);
    if (result.status !== 'valid') {
      criticalErrors++;
    }
  }

  // Validate required variables
  printSection('Required Variables');
  for (const req of envRequirements.required) {
    const result = validateEnvVar(envVars, req);
    printResult(req.name, req.description, result);
    if (result.status !== 'valid') {
      warnings++;
    }
  }

  // Check optional variables
  printSection('Optional Variables');
  let optionalSet = 0;
  for (const req of envRequirements.optional) {
    const value = envVars[req.name];
    if (value) {
      optionalSet++;
      console.log(`  ${colors.green}✓${colors.reset} ${req.name}`);
    } else {
      console.log(`  ${colors.blue}○${colors.reset} ${req.name} ${colors.blue}(not configured)${colors.reset}`);
    }
  }

  // Connectivity checks
  printSection('Connectivity Checks');

  const solanaEndpoint = envVars.NEXT_PUBLIC_SOLANA_ENDPOINT;
  if (solanaEndpoint) {
    const solanaOk = await checkSolanaConnection(solanaEndpoint);
    if (solanaOk) {
      console.log(`  ${colors.green}✓${colors.reset} Solana RPC: Connected`);
    } else {
      console.log(`  ${colors.yellow}!${colors.reset} Solana RPC: Unable to connect`);
      warnings++;
    }
  }

  // Summary
  printSection('Summary');

  if (criticalErrors === 0 && warnings === 0) {
    console.log(`  ${colors.green}${colors.bold}All checks passed!${colors.reset}`);
    console.log(`  ${colors.green}✓${colors.reset} ${envRequirements.critical.length} critical variables configured`);
    console.log(`  ${colors.green}✓${colors.reset} ${envRequirements.required.length} required variables configured`);
    console.log(`  ${colors.blue}○${colors.reset} ${optionalSet}/${envRequirements.optional.length} optional variables configured`);
    process.exit(0);
  } else {
    if (criticalErrors > 0) {
      console.log(`  ${colors.red}${colors.bold}${criticalErrors} critical error(s) found!${colors.reset}`);
      console.log(`  ${colors.red}Application may not start correctly.${colors.reset}`);
    }
    if (warnings > 0) {
      console.log(`  ${colors.yellow}${warnings} warning(s) found.${colors.reset}`);
      console.log(`  ${colors.yellow}Some features may not work correctly.${colors.reset}`);
    }

    // Exit with error only for critical issues
    process.exit(criticalErrors > 0 ? 1 : 0);
  }
}

main().catch((error) => {
  console.error(`${colors.red}Error running environment validation:${colors.reset}`, error);
  process.exit(1);
});
