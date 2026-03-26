#!/usr/bin/env node
/**
 * issue-stats.js — Count open issues by severity, domain, tracker, and effort.
 *
 * Usage: node .claude/skills/fix-issues/scripts/issue-stats.js
 *
 * Parses all plans/*ISSUES*.md files, extracts issue entries, and produces
 * summary tables.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const plansDir = join(repoRoot, 'plans');

// --- Find all issue tracker files ---

let issueFiles;
try {
  issueFiles = readdirSync(plansDir)
    .filter(f => f.includes('ISSUES') && f.endsWith('.md'))
    .sort();
} catch {
  console.log('No plans/ directory found.');
  process.exit(0);
}

if (issueFiles.length === 0) {
  console.log('No issue tracker files found in plans/');
  process.exit(0);
}

// --- Domain mapping from filename ---

function domainFromFile(filename) {
  if (filename.includes('QE')) return 'tests';
  if (filename.includes('DOC')) return 'docs';
  return 'general';
}

// --- Parse severity from context lines ---

function extractSeverity(text) {
  const m = text.match(/\*?\*?Severity\*?\*?:?\s*(\w+)/i);
  if (m) return m[1].toLowerCase();
  if (/\bcritical\b/i.test(text)) return 'critical';
  if (/\bhigh\b/i.test(text)) return 'high';
  if (/\bmedium\b/i.test(text)) return 'medium';
  if (/\blow\b/i.test(text)) return 'low';
  return 'unspecified';
}

// --- Parse effort from context lines ---

function extractEffort(text) {
  const m = text.match(/\*?\*?(?:Effort|Complexity)\*?\*?:?\s*([\w\s\-–]+?)(?:\||$|\n)/i);
  if (m) {
    const effort = m[1].trim().toLowerCase();
    if (/trivial|15\s*min/i.test(effort)) return 'trivial';
    if (/small|1\s*h/i.test(effort)) return 'small';
    if (/medium|2-4\s*h/i.test(effort)) return 'medium';
    if (/large|day/i.test(effort)) return 'large';
    return effort.slice(0, 15);
  }
  return 'unspecified';
}

// --- Extract issues from a file ---
// Returns array of { num, open, severity, effort }

function extractIssues(content, file) {
  const lines = content.split('\n');
  const issues = [];
  const seenNums = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    let num = null;
    let open = true;

    // Pattern 1: Checklist items — "- [ ] #NNN" or "- [x] #NNN"
    const checkMatch = trimmed.match(/^- \[( |x)\]\s+#(\d+)/i);
    if (checkMatch) {
      open = checkMatch[1] === ' ';
      num = parseInt(checkMatch[2], 10);
    }

    // Pattern 2: Heading with GH issue number — "### #NNN — title"
    if (!num) {
      const headMatch = trimmed.match(/^###\s+(?:~~)?#(\d+)/);
      if (headMatch) {
        num = parseInt(headMatch[1], 10);
        open = !(/~~/.test(trimmed) || /RESOLVED|FIXED|DONE|CLOSED/i.test(trimmed));
      }
    }

    // Pattern 3: Heading with R/D prefix — "### ~~R1. title~~ FIXED" or "### R1. title"
    if (!num) {
      const rMatch = trimmed.match(/^###\s+(?:~~)?[RD](\d+)[.:]/);
      if (rMatch) {
        // Look for GitHub issue number in the next few lines
        for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
          const ghLine = lines[j].match(/GitHub.*?#(\d+)/i);
          if (ghLine) {
            num = parseInt(ghLine[1], 10);
            break;
          }
        }
        open = !(/~~/.test(trimmed) || /FIXED|DONE|RESOLVED|CLOSED/i.test(trimmed));
      }
    }

    // Pattern 4: Heading with local number + GitHub reference on nearby line
    // "### 1. Title" followed by "**GitHub:** #NNN" or "**GitHub Issue:** #NNN"
    if (!num) {
      const localMatch = trimmed.match(/^###\s+(\d+)\.\s+/);
      if (localMatch) {
        // Look at next 5 lines for GitHub issue reference
        for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
          const ghLine = lines[j].match(/GitHub.*?#(\d+)/i);
          if (ghLine) {
            num = parseInt(ghLine[1], 10);
            break;
          }
        }
        if (!num) continue; // No GH reference found
        open = !(/~~/.test(trimmed) || /FIXED|DONE|RESOLVED|CLOSED/i.test(trimmed));
      }
    }

    if (!num || num <= 0 || num > 10000) continue;
    if (seenNums.has(num)) continue;
    seenNums.add(num);

    // Get context for severity/effort extraction (this line + next 8)
    const context = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
    const severity = open ? extractSeverity(context) : 'n/a';
    const effort = open ? extractEffort(context) : 'n/a';

    issues.push({ num, open, severity, effort });
  }

  return issues;
}

// --- Parse all files ---

const stats = {
  bySeverity: {},
  byDomain: {},
  byTracker: {},
  byEffort: {},
  total: 0,
  open: 0,
  closed: 0,
};

for (const file of issueFiles) {
  const abs = join(plansDir, file);
  const content = readFileSync(abs, 'utf-8');
  const domain = domainFromFile(file);
  const issues = extractIssues(content, file);

  let fileOpen = 0;
  let fileClosed = 0;

  for (const issue of issues) {
    stats.total++;
    if (issue.open) {
      stats.open++;
      fileOpen++;
      stats.bySeverity[issue.severity] = (stats.bySeverity[issue.severity] || 0) + 1;
      stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;
      stats.byEffort[issue.effort] = (stats.byEffort[issue.effort] || 0) + 1;
    } else {
      stats.closed++;
      fileClosed++;
    }
  }

  stats.byTracker[file] = { open: fileOpen, closed: fileClosed, total: issues.length };
}

// --- Output ---

console.log(`\n=== Issue Stats ===\n`);
console.log(`Total entries: ${stats.total} (${stats.open} open, ${stats.closed} closed)\n`);

// By tracker file
console.log('--- By Tracker ---\n');
console.log('  File                                    | Open | Closed | Total');
console.log('  ' + '-'.repeat(40) + '-|------|-' + '-'.repeat(6) + '-|------');
for (const [file, counts] of Object.entries(stats.byTracker)) {
  const name = file.padEnd(40);
  console.log(`  ${name} | ${String(counts.open).padStart(4)} | ${String(counts.closed).padStart(4)}   | ${String(counts.total).padStart(4)}`);
}

// By domain
console.log('\n--- By Domain (open only) ---\n');
const domainOrder = ['tests', 'docs', 'general'];
for (const d of domainOrder) {
  if (stats.byDomain[d]) {
    console.log(`  ${d.padEnd(15)} ${stats.byDomain[d]}`);
  }
}

// By severity
console.log('\n--- By Severity (open only) ---\n');
const sevOrder = ['critical', 'high', 'medium', 'low', 'unspecified'];
for (const s of sevOrder) {
  if (stats.bySeverity[s]) {
    console.log(`  ${s.padEnd(15)} ${stats.bySeverity[s]}`);
  }
}

// By effort
console.log('\n--- By Effort (open only) ---\n');
const effOrder = ['trivial', 'small', 'medium', 'large', 'unspecified'];
for (const e of effOrder) {
  if (stats.byEffort[e]) {
    console.log(`  ${e.padEnd(15)} ${stats.byEffort[e]}`);
  }
}

console.log('');
