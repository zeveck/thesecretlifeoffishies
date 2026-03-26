#!/usr/bin/env node
/**
 * sync-issues.js — Compare GitHub issues against local plan files.
 *
 * Usage:
 *   node .claude/skills/fix-issues/scripts/sync-issues.js          # report gaps
 *   node .claude/skills/fix-issues/scripts/sync-issues.js --fix    # append missing issues to ISSUES_PLAN.md
 *
 * Requires: gh CLI authenticated with repo access.
 */

import { execSync } from 'node:child_process';
import { readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const fix = process.argv.includes('--fix');

// --- Fetch open GitHub issues ---

let ghIssues;
try {
  const raw = execSync(
    'gh issue list --state open --limit 500 --json number,title,labels,createdAt',
    { encoding: 'utf-8', cwd: root }
  );
  ghIssues = JSON.parse(raw);
} catch (err) {
  console.error('Failed to fetch GitHub issues. Is `gh` authenticated?');
  console.error(err.message);
  process.exit(1);
}

console.log(`\nGitHub: ${ghIssues.length} open issues\n`);

// --- Parse plan files for tracked issue numbers ---
// Dynamically find all .md files in plans/ directory

const plansDir = join(root, 'plans');
let planFiles = [];
try {
  planFiles = readdirSync(plansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => `plans/${f}`);
} catch {
  console.warn('  Warning: plans/ directory not found');
}

const trackedNumbers = new Set();
const fileTracked = {};

for (const rel of planFiles) {
  const abs = join(root, rel);
  let content;
  try {
    content = readFileSync(abs, 'utf-8');
  } catch {
    console.warn(`  Warning: ${rel} not found, skipping`);
    continue;
  }

  // Match #NNN patterns (GitHub issue references)
  const matches = content.matchAll(/#(\d+)/g);
  const nums = new Set();
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n < 10000) {
      trackedNumbers.add(n);
      nums.add(n);
    }
  }
  fileTracked[rel] = nums;
}

console.log(`Plan files: ${trackedNumbers.size} unique issue numbers tracked across ${Object.keys(fileTracked).length} files\n`);

// --- Find gaps ---

// Issues on GitHub but not in any plan file
const ghNumbers = new Set(ghIssues.map(i => i.number));
const notInPlan = ghIssues
  .filter(i => !trackedNumbers.has(i.number))
  .sort((a, b) => a.number - b.number);

// Issues in plan files but closed on GitHub (i.e., not in the open list)
// Note: this only catches issues that are in the plan AND not open.
// Some may be closed intentionally — this is informational.
const closedInPlan = [];
for (const num of trackedNumbers) {
  if (!ghNumbers.has(num)) {
    closedInPlan.push(num);
  }
}
// Sort and remove very old issues (likely intentionally closed)
closedInPlan.sort((a, b) => a - b);

// --- Report ---

if (notInPlan.length > 0) {
  console.log(`=== ${notInPlan.length} GitHub issues NOT in any plan file ===\n`);
  console.log('  #    | Created    | Labels                  | Title');
  console.log('-------|------------|-------------------------|' + '-'.repeat(50));
  for (const i of notInPlan) {
    const num = String(i.number).padStart(4);
    const date = i.createdAt.slice(0, 10);
    const labels = (i.labels || []).map(l => l.name).join(', ').slice(0, 23).padEnd(23);
    const title = i.title.slice(0, 48);
    console.log(`  #${num} | ${date} | ${labels} | ${title}`);
  }
  console.log('');
} else {
  console.log('All open GitHub issues are tracked in plan files.\n');
}

if (closedInPlan.length > 0) {
  // Only show recently-relevant ones (above #10)
  const relevant = closedInPlan.filter(n => n >= 10);
  if (relevant.length > 0) {
    console.log(`=== ${relevant.length} plan-tracked issues not in open GH list (may be closed) ===\n`);
    // Show in groups of 15 per line for compactness
    for (let i = 0; i < relevant.length; i += 15) {
      const chunk = relevant.slice(i, i + 15).map(n => `#${n}`).join(', ');
      console.log(`  ${chunk}`);
    }
    console.log('');
  }
}

// --- Fix mode: append missing issues to ISSUES_PLAN.md ---

if (fix && notInPlan.length > 0) {
  const planPath = join(root, 'plans/ISSUES_PLAN.md');
  const lines = notInPlan.map(i => {
    const labels = (i.labels || []).map(l => l.name).join(', ');
    return `- [ ] #${i.number} — ${i.title}${labels ? ` [${labels}]` : ''}`;
  });

  const block = '\n\n## Untracked (auto-added by sync-issues)\n\n' + lines.join('\n') + '\n';
  appendFileSync(planPath, block);
  console.log(`Appended ${notInPlan.length} issues to plans/ISSUES_PLAN.md`);
} else if (fix && notInPlan.length === 0) {
  console.log('Nothing to fix — all issues are tracked.');
}

console.log('');
