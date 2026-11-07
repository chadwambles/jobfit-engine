/**
 * Splits a pasted dump into postings and tags each one.
 *
 * Splitting is format-specific and tagging is not, so they are separate.
 * Today one format is supported properly. Users will paste from Indeed, from
 * PDFs and from email alerts, and each needs its own splitter. That is the
 * known fragility of this whole product, so it is isolated here behind
 * detectFormat() rather than spread through the engine.
 */

const ONENOTE_URL = /From <(https:\/\/www\.linkedin\.com[^>]*)>/g;
const BULLET = /^\s*(?:[•·●▪‣⁃o]\s+|[-*]\s+|\d{1,2}[.)]\s+)(.+)$/;

/** Legal and benefits boilerplate. Not requirements, so it must not be tagged. */
const BOILERPLATE =
  /equal opportunity|discriminat|veteran status|sexual orientation|gender identity|reasonable accommodation|401\(?k\)?|dental|vision insurance|paid time off|\bPTO\b|tuition reimburse|stock purchase|life insurance|flexible spending|E-Verify|background check|drug screen|arrest or conviction|salary range|pay range|compensation (?:range|package)|benefits (?:package|may)|we celebrate diversity|protected (?:characteristic|by applicable law)|sponsorship|visa|physical demands|lift up to|prolonged periods|work environment/i;

/** Mentions AI without asking for it: company branding, and the disclosure
 *  that the employer screens applicants with AI. Neither is a requirement. */
const HIRING_AI =
  /hiring process|reviewing applicat|screen\w* (?:applicant|candidate)|supercharged by|powered by (?:people|ai)/i;

export function detectFormat(text) {
  if (/From <https:\/\/www\.linkedin\.com/.test(text)) return "linkedin-onenote";
  if (/\bAbout the job\b/.test(text)) return "linkedin-loose";
  return "generic";
}

/** @returns {{header:string, body:string, url:string|null, raw:string}[]} */
export function splitPostings(text) {
  const format = detectFormat(text);
  if (format === "linkedin-onenote") return splitOneNote(text);
  if (format === "linkedin-loose") return splitOnMarker(text, /\bAbout the job\b/g);
  return splitOnBlankRuns(text);
}

function splitOneNote(text) {
  const urls = [...text.matchAll(ONENOTE_URL)].map((m) => m[1]);
  const chunks = text.split(ONENOTE_URL).filter((_, i) => i % 2 === 0);
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    const chunk = chunks[i] ?? "";
    const k = chunk.indexOf("About the job");
    out.push({
      header: k >= 0 ? chunk.slice(0, k) : chunk,
      body: k >= 0 ? chunk.slice(k + "About the job".length) : "",
      url: urls[i],
      raw: chunk,
    });
  }
  return out;
}

function splitOnMarker(text, marker) {
  const idx = [...text.matchAll(marker)].map((m) => m.index);
  if (!idx.length) return splitOnBlankRuns(text);
  const out = [];
  for (let i = 0; i < idx.length; i++) {
    const start = i === 0 ? 0 : idx[i - 1];
    const end = i === idx.length - 1 ? text.length : idx[i + 1] ?? text.length;
    const chunk = text.slice(start, end);
    const k = chunk.indexOf("About the job");
    out.push({
      header: k >= 0 ? chunk.slice(0, k) : chunk,
      body: k >= 0 ? chunk.slice(k + 13) : chunk,
      url: null,
      raw: chunk,
    });
  }
  return out;
}

/** Last resort: treat runs of three or more newlines as posting boundaries. */
function splitOnBlankRuns(text) {
  return text
    .split(/\n\s*\n\s*\n+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 200)
    .map((c) => ({ header: c.slice(0, 400), body: c, url: null, raw: c }));
}

export function bullets(body) {
  const out = [];
  for (const line of body.split(/\r?\n/)) {
    const m = BULLET.exec(line);
    if (!m) continue;
    const t = m[1].replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "");
    if (t.length < 12 || t.length > 400) continue;
    if (BOILERPLATE.test(t)) continue;
    out.push(t);
  }
  return out;
}

/**
 * Tag one posting against a compiled vocabulary.
 * `scope: "bullets"` entries are matched only inside requirement bullets,
 * which is how AI and prioritization avoid matching company prose.
 */
export function tagPosting(posting, vocab) {
  const bl = bullets(posting.body);
  const hits = [];
  for (const item of vocab) {
    if (item.scope === "bullets") {
      const found = bl.some((b) => item.re.test(b) && !HIRING_AI.test(b));
      if (found) hits.push(item);
    } else if (item.re.test(posting.body)) {
      hits.push(item);
    }
  }
  return hits;
}

export { HIRING_AI, BOILERPLATE };
