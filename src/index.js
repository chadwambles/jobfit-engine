/** Public API. No model calls anywhere in this package, by design. */
export { buildProfile, profileSize, profileBucket, digest, catalogFor } from "./profile.js";
export { markets, marketById, chooseMarket } from "./markets.js";
export { computeGap } from "./gap.js";
export { matchProjects, catalogBlindSpots } from "./match.js";
export { splitPostings, tagPosting, bullets, detectFormat } from "./parse.js";
export { capabilities, tools, domains, certifications, dimensions, vocabVersion,
         removedCapabilities } from "./vocab.js";
export { seedCatalog, catalogVersion } from "./catalog.js";
export { referenceProfile, referenceFor, baReference, technicalReference } from "./reference.js";
export { vocabularyScope, inVocabularyScope, assessScope, QUIET } from "./scope.js";
export { inferOccupation, matchActivities, matchTasks, matchTools,
         findOccupations, occupationProfile,
         occupations, activities, tools as onetTools, onetMeta } from "./onet.js";
