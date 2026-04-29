#!/usr/bin/env node
/**
 * Fetches German vocabulary data from English Wiktionary for every word in
 * data/wordlist.json and writes the result to data/vocab.json.
 *
 * Usage:
 *   node scripts/fetch-vocab.mjs              # fetch all missing words
 *   node scripts/fetch-vocab.mjs --force      # re-fetch everything
 *   node scripts/fetch-vocab.mjs --word Haus  # fetch a single word
 *
 * Rate limit: 1 request / second (Wiktionary asks for politeness).
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');
const WLIST  = join(ROOT, 'data', 'wordlist.json');
const VOCAB  = join(ROOT, 'data', 'vocab.json');
const API    = 'https://en.wiktionary.org/w/api.php';
const DELAY  = 1500; // ms between requests (increased for politeness)

// ── CLI flags ────────────────────────────────────────────
const args  = process.argv.slice(2);
const FORCE = args.includes('--force');
const SINGLE = (() => { const i = args.indexOf('--word'); return i >= 0 ? args[i + 1] : null; })();

// ── Helpers ──────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripLinks(s) {
  return s.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2').trim();
}

// ── Wiktionary fetch ─────────────────────────────────────

async function fetchWikitext(word, retries = 4) {
  const url = new URL(API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', word);
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('rvprop', 'content');
  url.searchParams.set('rvslots', 'main');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'GermanStudyApp/1.0 (educational)' } });
    if (res.status === 429) {
      if (attempt === retries) throw new Error(`HTTP 429 for "${word}" (gave up after ${retries + 1} attempts)`);
      const backoff = 10000 * Math.pow(2, attempt); // 10s, 20s, 40s, 80s
      process.stdout.write(`429 — waiting ${backoff / 1000}s before retry ${attempt + 1}/${retries}... `);
      await sleep(backoff);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for "${word}"`);
    const data = await res.json();
    const page = data.query.pages[0];
    if (page.missing || !page.revisions) return null;
    return page.revisions[0].slots.main.content;
  }
}

// ── Wikitext parser ──────────────────────────────────────

function extractGermanSection(wikitext) {
  const start = wikitext.indexOf('==German==');
  if (start === -1) return null;
  // Find next top-level section (==X== but NOT ===X===)
  const rest = wikitext.slice(start + 10);
  const nextTop = rest.search(/\n==[^=]/);
  return nextTop === -1 ? wikitext.slice(start) : wikitext.slice(start, start + 10 + nextTop);
}

function parseIPA(section) {
  const m = section.match(/\{\{IPA\|de\|([^}|]+)/);
  return m ? m[1].trim() : null;
}

function parsePos(section) {
  if (/===\s*Noun\s*===/.test(section))      return 'noun';
  if (/===\s*Verb\s*===/.test(section))      return 'verb';
  if (/===\s*Adjective\s*===/.test(section)) return 'adjective';
  if (/===\s*Adverb\s*===/.test(section))    return 'adverb';
  if (/===\s*Preposition\s*===/.test(section)) return 'preposition';
  if (/===\s*Conjunction\s*===/.test(section)) return 'conjunction';
  if (/===\s*Pronoun\s*===/.test(section))   return 'pronoun';
  if (/===\s*Determiner\s*===/.test(section)) return 'determiner';
  if (/===\s*Interjection\s*===/.test(section)) return 'interjection';
  return 'other';
}

function parseNounTemplate(section) {
  // {{de-noun|n|Hauses|Häuser}} or {{de-noun|f||Frauen}}
  const m = section.match(/\{\{de-noun\|([^}]+)\}\}/);
  if (!m) return {};
  const parts = m[1].split('|');
  const genderMap = { m: 'der', f: 'die', n: 'das' };
  const result = {};

  // gender: first positional arg (skip named args)
  for (const p of parts) {
    if (!p.includes('=') && /^[mfn]$/.test(p.trim())) {
      result.article = genderMap[p.trim()] ?? null;
      break;
    }
  }

  // genitive & plural: positional args 2 and 3
  const positional = parts.filter(p => !p.includes('='));
  if (positional[1]) result.genitive = positional[1].trim() || null;
  if (positional[2]) result.plural   = positional[2].trim() || null;

  // named: dim=, pl2=, etc.
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k === 'dim')  result.diminutive = v?.trim();
    if (k === 'pl2')  result.plural2    = v?.trim();
  }
  return result;
}

function parseVerbTemplate(section) {
  const result = {};

  // {{de-verb|sein}} or {{de-verb|haben}}
  const auxM = section.match(/\{\{de-verb\|[^}]*aux:(sein|haben)[^}]*\}\}/);
  if (auxM) result.auxiliary = auxM[1];
  if (!result.auxiliary) {
    if (/\|\s*sein\s*[|}]/.test(section)) result.auxiliary = 'sein';
    else result.auxiliary = 'haben';
  }

  // {{de-conj-...}} tables or inline pret/pp
  const pretM = section.match(/pret:([a-zäöüß]+)/i);
  if (pretM) result.preterite = pretM[1];

  const ppM = section.match(/pp:([a-zäöüß]+(?:\s[a-zäöüß]+)?)/i);
  if (ppM) result.pastParticiple = ppM[1];

  // {{de-verb-strong}} or {{de-verb-weak}} for strong/weak classification
  if (/de-verb-strong/.test(section)) result.verbType = 'strong';
  else if (/de-verb-weak/.test(section)) result.verbType = 'weak';

  return result;
}

function parseAdjTemplate(section) {
  const result = {};
  const m = section.match(/\{\{de-adj\|([^}]+)\}\}/);
  if (!m) return result;
  const parts = m[1].split('|');
  if (parts[0] && !parts[0].includes('=')) result.comparative = parts[0].trim();
  if (parts[1] && !parts[1].includes('=')) result.superlative  = parts[1].trim();
  return result;
}

function parseTranslations(section) {
  // Grab definitions from the POS section (lines starting with # but not #:, #*, ##)
  const defs = [];
  const lines = section.split('\n');
  let inDef = false;
  for (const line of lines) {
    if (/^===[^=]/.test(line)) inDef = true;
    if (/^====/.test(line))    inDef = false;
    if (inDef && /^# /.test(line)) {
      const raw = line.slice(2).trim();
      // skip templated non-definitions
      if (/^\{\{lb\|/.test(raw)) continue;
      const clean = stripLinks(raw)
        .replace(/\{\{[^}]+\}\}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (clean) defs.push(clean);
    }
  }
  return defs.slice(0, 5);
}

function parseExamples(section) {
  const examples = [];
  const lines = section.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^#: /.test(lines[i])) {
      const de = lines[i].slice(3).replace(/''|''/g, '').replace(/\{\{[^}]+\}\}/g, '').trim();
      let en = null;
      if (i + 1 < lines.length && /^#:: /.test(lines[i + 1])) {
        en = lines[i + 1].slice(4).replace(/''|''/g, '').replace(/\{\{[^}]+\}\}/g, '').trim();
        i++;
      }
      if (de) examples.push({ de, en });
    }
  }
  return examples.slice(0, 3);
}

function parseRelated(section) {
  const m = section.match(/====\s*(?:Related terms|Derived terms)\s*====\n([\s\S]*?)(?:====|$)/);
  if (!m) return [];
  return [...m[1].matchAll(/\[\[([^\]|#]+)/g)]
    .map(x => x[1].trim())
    .filter(w => /^[A-ZÄÖÜ]/.test(w) || /^[a-zäöüß]/.test(w))
    .slice(0, 8);
}

// ── Main parse ───────────────────────────────────────────

function parseEntry(word, wikitext) {
  const section = extractGermanSection(wikitext);
  if (!section) return null;

  const pos = parsePos(section);
  const entry = { word, pos, source: 'wiktionary' };

  const ipa = parseIPA(section);
  if (ipa) entry.ipa = ipa;

  if (pos === 'noun') {
    Object.assign(entry, parseNounTemplate(section));
  } else if (pos === 'verb') {
    Object.assign(entry, parseVerbTemplate(section));
  } else if (pos === 'adjective') {
    Object.assign(entry, parseAdjTemplate(section));
  }

  entry.translations = parseTranslations(section);
  entry.examples     = parseExamples(section);
  entry.related      = parseRelated(section);

  return entry;
}

// ── Orchestration ─────────────────────────────────────────

async function loadVocab() {
  if (!existsSync(VOCAB)) return {};
  const raw = await readFile(VOCAB, 'utf8');
  return JSON.parse(raw);
}

async function saveVocab(vocab) {
  await mkdir(join(ROOT, 'data'), { recursive: true });
  await writeFile(VOCAB, JSON.stringify(vocab, null, 2), 'utf8');
}

async function processWord(word, vocab) {
  if (!FORCE && vocab[word]) {
    process.stdout.write(`  skip  ${word}\n`);
    return;
  }
  try {
    process.stdout.write(`  fetch ${word} ... `);
    const wikitext = await fetchWikitext(word);
    if (!wikitext) {
      process.stdout.write('not found\n');
      vocab[word] = { word, pos: 'unknown', translations: [], examples: [], related: [], source: 'wiktionary' };
      return;
    }
    const entry = parseEntry(word, wikitext);
    if (!entry) {
      process.stdout.write('no German entry\n');
      vocab[word] = { word, pos: 'unknown', translations: [], examples: [], related: [], source: 'wiktionary' };
      return;
    }
    vocab[word] = entry;
    const info = [entry.article, entry.plural ? `pl: ${entry.plural}` : null, entry.translations.slice(0, 2).join(', ')].filter(Boolean).join(' | ');
    process.stdout.write(`ok  (${info})\n`);
  } catch (err) {
    process.stdout.write(`ERROR: ${err.message}\n`);
  }
}

async function main() {
  const wordlist = JSON.parse(await readFile(WLIST, 'utf8'));
  const vocab    = await loadVocab();

  let words;
  if (SINGLE) {
    words = [SINGLE];
  } else {
    const set = new Set();
    for (const level of Object.values(wordlist)) {
      for (const ws of Object.values(level)) {
        ws.forEach(w => set.add(w));
      }
    }
    words = [...set].sort();
  }

  console.log(`Processing ${words.length} word(s)...\n`);
  let saved = 0;

  for (let i = 0; i < words.length; i++) {
    await processWord(words[i], vocab);
    saved++;

    // Save every 20 words so progress is preserved
    if (saved % 20 === 0) {
      await saveVocab(vocab);
      console.log(`  [saved ${saved}/${words.length}]`);
    }

    if (i < words.length - 1) await sleep(DELAY);
  }

  await saveVocab(vocab);
  console.log(`\nDone. ${words.length} words written to data/vocab.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
