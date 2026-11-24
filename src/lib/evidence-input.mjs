import fs from 'node:fs';
import path from 'node:path';

export const TRANSITION_USAGE = 'Usage: idefactory attempt transition <attemptId> <state> [--evidence json | --evidence-file path]';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);

/**
 * Resolve attempt transition evidence from `--evidence <json>` or
 * `--evidence-file <path>`. Exactly one source may be given. Any failure
 * throws before the caller changes attempt state.
 * A relative file path resolves from `cwd`.
 * @param {Record<string, string|boolean|undefined>} flags
 * @param {{ cwd?: string }} [options]
 * @returns {object}
 */
export function readTransitionEvidence(flags, { cwd = process.cwd() } = {}) {
  const inline = flags.evidence;
  const file = flags['evidence-file'];
  if (inline === true || file === true || file === '') {
    throw new Error(TRANSITION_USAGE);
  }
  const hasInline = typeof inline === 'string' && inline.length > 0;
  const hasFile = typeof file === 'string';
  if (hasInline && hasFile) {
    throw new Error('attempt transition accepts only one of --evidence and --evidence-file; remove one.');
  }
  if (hasFile) return readEvidenceFile(file, cwd);
  if (hasInline) return parseInline(inline);
  return {};
}

function parseInline(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Invalid --evidence JSON: ${error.message}. Pass the JSON with --evidence-file <path> to avoid shell quoting.`,
    );
  }
}

function readEvidenceFile(file, cwd) {
  const resolved = path.resolve(cwd, file);
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      throw new Error(
        `evidence file not found: ${file}. --evidence-file takes a path; --evidence takes inline JSON.`,
      );
    }
    throw new Error(`cannot read evidence file ${file}: ${error.message}`);
  }
  if (stat.isDirectory()) throw new Error(`evidence file is a directory: ${file}`);

  let bytes;
  try {
    bytes = fs.readFileSync(resolved);
  } catch (error) {
    throw new Error(`cannot read evidence file ${file}: ${error.message}`);
  }

  const text = decode(bytes);
  if (text.trim().length === 0) throw new Error(`evidence file is empty: ${file}`);

  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`evidence file ${file} is not valid JSON: ${error.message}`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`evidence file ${file} must hold a JSON object`);
  }
  return value;
}

function decode(bytes) {
  if (bytes.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) {
    return bytes.subarray(UTF8_BOM.length).toString('utf8');
  }
  if (bytes.subarray(0, UTF16LE_BOM.length).equals(UTF16LE_BOM)) {
    return bytes.subarray(UTF16LE_BOM.length).toString('utf16le');
  }
  return bytes.toString('utf8');
}
