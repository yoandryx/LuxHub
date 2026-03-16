#!/usr/bin/env node
// scripts/lint-sec-language.js
// Scans user-facing source files for SEC-sensitive language.
// Exit 0 = clean, Exit 1 = violations found.
//
// Usage:
//   node scripts/lint-sec-language.js              # scan all
//   node scripts/lint-sec-language.js src/pages/pools.tsx  # scan specific files

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Banned patterns ─────────────────────────────────────────────
// Each entry: [regex, suggestion]
// Only match whole-word occurrences to avoid false positives in
// variable names / API field keys that the backend requires.
const BANNED = [
  [/\bfractional\s+ownership\b/gi, 'tokenized access / tokenized pool'],
  [/\bfractional\s+shares?\b/gi, 'tokenized positions'],
  [/\binvest(?:ment|ments|ing|ed)?\b/gi, 'participate / contribute / join'],
  [/\binvestors?\b/gi, 'participants / contributors'],
  [/\b(?:return on investment|ROI)\b/gi, 'estimated value'],
  [/\bdividends?\b/gi, 'distributions / proceeds'],
  [/\bprofits?\b/gi, 'proceeds'],
  [/\bshareholders?\b/gi, 'token holders / participants'],
  [/\bequity\b/gi, 'position / participation'],
  [/\byield\b/gi, 'proceeds / distributions'],
  [/\bsecurities\b/gi, 'tokens / digital assets'],
];

// ── Allowlisted contexts ────────────────────────────────────────
// Lines matching any of these are skipped (comments explaining the
// rule, API field names the backend expects, etc.)
const ALLOW = [
  /^\s*\/\//,                    // single-line comments
  /^\s*\*/,                      // block comment lines
  /^\s*{\s*\/\*/,                // JSX comment openers
  /['"`]\/api\//,                // API endpoint strings
  /projectedROI/,                // backend field name
  /maxInvestors/,                // backend field name (API key)
  /totalShares/,                 // backend field name (API key)
  /sharePriceUSD/,               // backend field name (API key)
  /sharesSold/,                  // backend field name (API key)
  /sharePrice/,                  // backend field name (API key)
  /lint-sec-language/,           // this script itself
  /eslint-disable/,              // eslint directives
  /console\.(log|warn|error)/,   // console output (not user-facing)
  /investedUSD/,                 // backend field name
  /investedAt/,                  // backend field name
  /investorWallet/,              // backend field name
  /onInvestmentComplete/,        // callback prop name
  /holderDividend/,              // Bags API field name
  /totalDividendsDistributed/,   // Bags webhook field name
  /accumulatedHolderFees/,       // backend tracking field
];

// ── File discovery ──────────────────────────────────────────────
const SCAN_GLOBS = [
  'src/pages/**/*.{tsx,ts}',
  'src/components/**/*.{tsx,ts}',
];

// Files that are NOT user-facing (API routes, models, utils, scripts, tasks)
const SKIP_DIRS = ['/api/', '/lib/', '/utils/', '/context/', '/hooks/', '/idl/', '/scripts/', '/tasks/'];

function getFiles(args) {
  if (args.length) return args.filter((f) => fs.existsSync(f));

  // Use git ls-files for speed
  try {
    const raw = execSync(
      `git ls-files -- ${SCAN_GLOBS.map((g) => `'${g}'`).join(' ')}`,
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf-8' }
    );
    return raw
      .trim()
      .split('\n')
      .filter((f) => f && !SKIP_DIRS.some((d) => f.includes(d)));
  } catch {
    console.error('Failed to list files via git. Pass files explicitly.');
    process.exit(2);
  }
}

// ── Scanner ─────────────────────────────────────────────────────
function scan(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip allowlisted contexts
    if (ALLOW.some((re) => re.test(line))) continue;

    for (const [pattern, suggestion] of BANNED) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        hits.push({
          file: filePath,
          line: i + 1,
          col: match.index + 1,
          found: match[0],
          suggestion,
          context: line.trim(),
        });
      }
    }
  }

  return hits;
}

// ── Main ────────────────────────────────────────────────────────
const files = getFiles(process.argv.slice(2));
let totalViolations = 0;

for (const file of files) {
  const hits = scan(file);
  if (hits.length) {
    totalViolations += hits.length;
    for (const h of hits) {
      console.log(
        `\x1b[31mSEC\x1b[0m  ${h.file}:${h.line}:${h.col}  "${h.found}" → use "${h.suggestion}"`
      );
      console.log(`     ${h.context}\n`);
    }
  }
}

if (totalViolations > 0) {
  console.log(
    `\n\x1b[31m✗ ${totalViolations} SEC-language violation${totalViolations > 1 ? 's' : ''} found.\x1b[0m`
  );
  console.log('See: .claude/projects/-home-ycstudio-LuxHub/memory/legal_language_rules.md\n');
  process.exit(1);
} else {
  console.log('\x1b[32m✓ No SEC-language violations found.\x1b[0m');
  process.exit(0);
}
