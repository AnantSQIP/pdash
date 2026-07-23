// Pragmatic patent-number recognition, used to gate "upload a document → create a patent":
// only files NAMED like a patent number are accepted. Strips separators (spaces, commas,
// dots, hyphens, brackets), then matches an optional 1–2 letter country/office code, 5–13
// digits, and an optional kind code (letter(s) + optional digit).
//
// Accepts:  US1234567 · US 9,876,543 B2 · EP2345678B1 · WO2019123456 · 7654321 · US20200123456A1
// Rejects:  scan.pdf · patent copy (1).pdf · invoice-2024 · document
const PATENT_RE = /^[A-Z]{0,2}\d{5,13}[A-Z]{0,2}\d?$/;

/** Strip the extension + separators and upper-case → the canonical form we store. */
export function normalizePatentNumber(raw: string): string {
  return (raw || '').replace(/\.[^.]+$/, '').replace(/[\s,._()\-\/]/g, '').toUpperCase();
}

/** Does this file name / string look like a real patent number? */
export function isPatentNumber(raw: string): boolean {
  return PATENT_RE.test(normalizePatentNumber(raw));
}
