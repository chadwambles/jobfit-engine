/**
 * Loads the shared vocabulary and compiles its patterns.
 *
 * The JSON files in data/ are the single source of truth. The Python study
 * reads the same files, so the published analysis and the running app can
 * never disagree about what a capability is.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

function load(name) {
  return JSON.parse(readFileSync(join(DATA, name), "utf8"));
}

function compile(items, key = "pattern") {
  return items.map((it) => ({ ...it, re: new RegExp(it[key], "i") }));
}

const capsRaw = load("capabilities.json");

export const capabilities = compile(capsRaw.capabilities);
export const removedCapabilities = capsRaw.removed;
export const tools = compile(load("tools.json").tools);
export const domains = compile(load("domains.json").domains);
export const certifications = compile(load("certifications.json").certifications);
export const vocabVersion = capsRaw.version;

/** Capabilities a person holds ECBA/CSPO-style credentials for is a different
 *  question from capabilities. Certifications stay their own dimension. */
export const dimensions = Object.freeze({
  capabilities: capabilities.length,
  tools: tools.length,
  domains: domains.length,
  certifications: certifications.length,
});
