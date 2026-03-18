#!/usr/bin/env node
// Import markdown files from a directory into memory-decay store
// Usage: node scripts/import-markdown.mjs <directory>
import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { v4 as uuid } from 'uuid';
import { ensureDirs, writeMemory } from '../lib/store.mjs';

const dir = process.argv[2];

if (!dir) {
  console.error('Usage: node scripts/import-markdown.mjs <directory>');
  process.exit(1);
}

const root = ensureDirs();

function extractDate(filename) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function firstLine(text) {
  const lines = text.split('\n');
  const skipPatterns = [
    /^\s*$/,
    /^#/,
    /^<!--/,
    /^>/,
    /^---/,
    /^_/,
    /^\[/,
    /^```/,
    /^\| /,
    /^- -$/,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 8) continue;
    if (skipPatterns.some(p => p.test(trimmed))) continue;
    const clean = trimmed.replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/^- /, '').replace(/^\d+\.\s*/, '');
    if (clean.length < 10) continue;
    return clean.slice(0, 150);
  }
  return '';
}

let imported = 0;
const seenSummaries = new Set();
const files = readdirSync(dir).filter(f => f.endsWith('.md'));

for (const file of files) {
  const text = readFileSync(join(dir, file), 'utf8');
  const dateStr = extractDate(file);
  const created = dateStr ? new Date(dateStr + 'T12:00:00Z').toISOString() : new Date().toISOString();
  const summary = firstLine(text) || basename(file, '.md');

  const dedupeKey = summary.slice(0, 80);
  if (seenSummaries.has(dedupeKey)) continue;
  seenSummaries.add(dedupeKey);

  const entry = {
    id: uuid(),
    created,
    type: 'reference',
    domain: 'general',
    summary,
    ttl: 'permanent',
    confidence: 0.7,
    tier: 'fresh',
  };

  writeMemory(entry, text, root);
  imported++;
}

console.log(`✅ Imported ${imported} memories from ${dir}.`);
console.log('Run `node bin/cli.mjs decay` to apply tier assignments.');
