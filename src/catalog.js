/**
 * The seed catalog, read the same way the vocabulary is.
 *
 * Consumers used to import the JSON directly, which depends on import
 * attributes and breaks under most bundlers. Reading it here keeps the
 * package importable from a Next.js route handler without special config.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const raw = JSON.parse(readFileSync(join(DATA, "catalog.seed.json"), "utf8"));

export const seedCatalog = raw.projects;
export const catalogVersion = raw.version;
