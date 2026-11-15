// Token Radar application entry point (Node.js 22, built-in APIs only).
//
// Workflow:
// 1. Resolve input path (defaults to /input or CLI --input) and output path (defaults to /output or MAKEFUN_OUTPUT_DIR or CLI --output).
// 2. Read and parse input snapshot.
// 3. Build radar scoring rows and check against validation gate.
// 4. Output board.json and data.js.
// 5. Copy dashboard assets and screenshot files, validating screenshot count (>=3) and valid filename characters.
// 6. Generate final dossier.json summary.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url));

// Gate constraints & naming specifications
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const VALID_IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Extract CLI argument value or return fallback. */
function getArg(flagName: string, fallbackValue: string): string {
  const idx = process.argv.indexOf(`--${flagName}`);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1]!;
  }
  const eqMatch = process.argv.find((argStr) => argStr.startsWith(`--${flagName}=`));
  return eqMatch === undefined ? fallbackValue : eqMatch.slice(flagName.length + 3);
}

// Configuration resolution
const inputArgValue = getArg('input', '/input');
const inputPath = inputArgValue.endsWith('.json') ? inputArgValue : join(inputArgValue, 'snapshot.json');

if (!existsSync(inputPath)) {
  process.stderr.write(`token radar: missing snapshot at ${inputPath}: provide --input <file|dir> or mount /input\n`);
  process.exit(2);
}

const outputPath = getArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// Parse snapshot and evaluate model board
const rawSnapshotContent = readFileSync(inputPath, 'utf8');
const parsedSnapshot = parseSnapshot(rawSnapshotContent);
const { board: scoredBoard, radar: radarMetrics } = buildRadar(parsedSnapshot);

// Gate inspection
const validationError = boardIssue(scoredBoard, parsedSnapshot);
if (validationError !== null) {
  process.stderr.write(`token radar: board failed validation gate: ${validationError}\n`);
  process.exit(1);
}

// Write core outputs
mkdirSync(outputPath, { recursive: true });
writeFileSync(join(outputPath, 'board.json'), `${JSON.stringify({ rows: scoredBoard })}\n`);
writeFileSync(join(outputPath, 'data.js'), dataScript(radarMetrics));

/** Helper to copy regular files from source directory to destination directory, excluding dotfiles. */
function copyDirectoryFiles(sourceDir: string, destDir: string): string[] {
  if (!existsSync(sourceDir)) return [];
  mkdirSync(destDir, { recursive: true });
  const copiedFiles: string[] = [];
  for (const entryName of readdirSync(sourceDir)) {
    if (entryName.startsWith('.')) continue;
    const itemPath = join(sourceDir, entryName);
    if (!statSync(itemPath).isFile()) continue;
    copyFileSync(itemPath, join(destDir, entryName));
    copiedFiles.push(entryName);
  }
  return copiedFiles;
}

copyDirectoryFiles(join(MODULE_DIR, 'dashboard'), join(outputPath, 'dashboard'));
const savedScreenshots = copyDirectoryFiles(join(MODULE_DIR, 'screenshots'), join(outputPath, 'screenshots'));

if (savedScreenshots.length < 3) {
  process.stderr.write(`token radar: screenshots/ contains ${savedScreenshots.length} image(s); require at least 3 (board, detail view, filtered view)\n`);
  process.exit(1);
}

for (const imageName of savedScreenshots) {
  if (!VALID_IMAGE_NAME.test(imageName)) {
    process.stderr.write(`token radar: screenshots/${imageName}: invalid filename format (must match letters, digits, '.', '_', '-', 1-128 chars)\n`);
    process.exit(1);
  }
}

// Generate dossier summary
const dossierConfig = {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};
writeFileSync(join(outputPath, 'dossier.json'), buildDossier(outputPath, dossierConfig));

// Log completion status
process.stdout.write(
  `token radar: ${parsedSnapshot.protocols.length} protocols, ${parsedSnapshot.watchlist.length} on the watchlist, ${scoredBoard.length} rows scored (${radarMetrics.early_size} early, ${radarMetrics.live_size} live set aside)\n` +
    `token radar: wrote ${join(outputPath, 'board.json')}, ${join(outputPath, 'data.js')}, ${join(outputPath, 'dashboard')} (3 files), ${join(outputPath, 'screenshots')} (${savedScreenshots.length} images) and ${join(outputPath, 'dossier.json')}\n`,
);
