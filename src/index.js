/** Public API. No model calls anywhere in this package, by design. */
export { buildProfile, profileSize, profileBucket, digest } from "./profile.js";
export { computeGap } from "./gap.js";
export { matchProjects, catalogBlindSpots } from "./match.js";
export { splitPostings, tagPosting, bullets, detectFormat } from "./parse.js";
export { capabilities, tools, domains, certifications, dimensions, vocabVersion,
         removedCapabilities } from "./vocab.js";
export { seedCatalog, catalogVersion } from "./catalog.js";
export { inferOccupation, matchActivities, matchTasks, matchTools,
         occupations, activities, tools as onetTools, onetMeta } from "./onet.js";
