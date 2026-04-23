// Norwegian ↔ French grade conversion table.
//
// Norwegian grades use a numeric scale with +/- modifiers (e.g. 5, 5+, 6-, 6, 6+, 7-, 7…).
// French grades use a numeric+letter+optional-plus system (e.g. 5a, 6a, 6a+, 6b, 7a…).
//
// These mappings are the widely-used approximations from standard comparison tables.
// They are NOT exact equivalences — different guidebooks and areas may interpret
// the conversion differently, especially around the 7-/7 and 8-/8 boundaries.
// Adjust the table below if your logbook uses a different mapping.

// Each entry is [NO_grade, FR_grade]
const GRADE_TABLE: [string, string][] = [
  ["3+",    "3"],
  ["4-",   "4a"],
  ["4",    "4b"],
  ["4+",   "4c"],
  ["5-",   "5a"],
  ["5",    "5b"],
  ["5+",   "5c"],
  ["6-",   "6a"],
  ["6",    "6a+"],
  ["6+",   "6b"],
  ["7-",   "6b+"],
  ["7-/7",  "6c"],
  ["7",    "6c"],
  ["7/7+", "6c+"],
  ["7+",   "7a"],
  ["7+/8-","7a+"],
  ["8-",   "7a+"],
  ["8",    "7b"],
  ["8/8+", "7b+"],
  ["8+",   "7c"],
  ["9-",   "8a"],
  ["9/9",  "8a+"],
  ["9",    "8b"],
  ["9/9+", "8b+"],
  ["9+",   "8c"],
  ["10-",  "9a"],
  ["10",   "9b"],
  ["10+",  "9b+"],
];

export const NO_GRADES: string[] = GRADE_TABLE.map(([no]) => no);
export const FR_GRADES: string[] = GRADE_TABLE.map(([, fr]) => fr);

const noToFr = new Map<string, string>(GRADE_TABLE.map(([no, fr]) => [no.toLowerCase(), fr]));
const frToNo = new Map<string, string>(GRADE_TABLE.map(([no, fr]) => [fr.toLowerCase(), no]));

export function toFrench(no: string): string | null {
  return noToFr.get(no.toLowerCase()) ?? null;
}

export function toNorwegian(fr: string): string | null {
  return frToNo.get(fr.toLowerCase()) ?? null;
}

/**
 * Given an entered grade and which system it's in, return both grades.
 * If conversion isn't found, the other grade is null.
 */
export function normalizeGrade(
  input: string,
  system: "NO" | "FR"
): { grade_no: string | null; grade_fr: string | null } {
  if (!input.trim()) return { grade_no: null, grade_fr: null };
  if (system === "NO") {
    return { grade_no: input, grade_fr: toFrench(input) };
  } else {
    return { grade_no: toNorwegian(input), grade_fr: input };
  }
}
