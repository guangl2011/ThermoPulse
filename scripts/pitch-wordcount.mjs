#!/usr/bin/env node
/**
 * Pitch word-count gate (ConnectWerx FY26 format).
 *
 * Parses docs/doe/pitch.md and fails when any capped pitch section exceeds its
 * word limit. Caps are read from each heading's "(≤N words)" marker so the
 * document stays the single source of truth. Sections without a cap marker
 * (source notes, submission checklist) are excluded from counting.
 *
 * On failure every section's count is reported, not just the offender.
 *
 * Usage: node scripts/pitch-wordcount.mjs [path-to-pitch.md]
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PITCH_PATH = process.argv[2] ?? "docs/doe/pitch.md";
// A capped pitch section heading, e.g. "## 1. Summary and Topic Alignment (≤100 words)".
const SECTION_RE = /^##\s+(.+?)\s*\(≤(\d+)\s+words?\)\s*$/;

function countWords(body) {
  return body.split(/\s+/).filter(Boolean).length;
}

function parseSections(text) {
  const sections = [];
  let current = null;
  for (const line of text.split("\n")) {
    const match = SECTION_RE.exec(line);
    if (match) {
      current = {
        title: match[1],
        cap: Number(match[2]),
        body: [],
      };
      sections.push(current);
    } else if (/^##\s/.test(line)) {
      // A non-capped ## section (source notes, checklist) ends the capped body.
      current = null;
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections.map(({ title, cap, body }) => ({
    title,
    cap,
    count: countWords(body.join("\n")),
  }));
}

const sections = parseSections(readFileSync(resolve(PITCH_PATH), "utf8"));
if (sections.length === 0) {
  console.error(
    `pitch-wordcount: no capped sections found in ${PITCH_PATH} — ` +
      `is this the ConnectWerx pitch file?`,
  );
  process.exit(1);
}

let failed = false;
const rows = sections.map(({ title, cap, count }) => {
  const status = count <= cap ? "PASS" : "FAIL";
  if (count > cap) failed = true;
  return `${title}: ${count}/${cap} words ${status}`;
});
console.log(`Pitch word counts (${PITCH_PATH}):`);
for (const row of rows) console.log(`  ${row}`);

if (failed) {
  console.error("pitch-wordcount: one or more pitch sections exceed their word cap.");
  process.exit(1);
}
console.log("pitch-wordcount: all sections within cap.");
