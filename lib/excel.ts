import * as XLSX from "xlsx";
import type { Climb, PartialClimb } from "./types";
import { deriveAscentResult, RESULT_LABEL } from "./types";
import { normalizeGrade, NO_GRADES } from "./grades";

// ── Header normalisation ────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[:\s]+$/, "");  // strip trailing colons / whitespace (common in Norwegian sheets)
}

// Maps normalised header → internal field name.
// Includes common variants (with/without accent, alternate spellings).
const HEADER_MAP: Record<string, keyof PartialClimb> = {
  dato: "date",
  "navn på rute": "route_name",
  rute: "route_name",
  "klatrefelt/fjell": "crag",
  klatrefelt: "crag",
  fjell: "crag",
  rutegrad: "grade_no",
  grad: "grade_no",
  "lengde på ruten": "length_m",
  lengde: "length_m",
  "type sikringer": "climb_type",
  sikringer: "climb_type",
  type: "climb_type",
  "klatretype": "climb_type",
  "værforhold": "weather",
  vær: "weather",
  klatrepartner: "partner",
  partner: "partner",
  bestigningsstil: "ascent_style",
  stil: "ascent_style",
  merknader: "notes",
  noter: "notes",
};

// ── Date parsing ─────────────────────────────────────────────────────────────

const NO_MONTHS: Record<string, number> = {
  jan: 1, januar: 1,
  feb: 2, februar: 2,
  mar: 3, mars: 3,
  apr: 4, april: 4,
  mai: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10,
  nov: 11, november: 11,
  des: 12, desember: 12,
};

function parseDate(raw: unknown): string | null {
  if (!raw) return null;

  // SheetJS parsed a real Excel date cell
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().split("T")[0];
  }

  // Excel serial number stored as a number
  if (typeof raw === "number" && raw > 0) {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) {
      const m = String(d.m).padStart(2, "0");
      const day = String(d.d).padStart(2, "0");
      return `${d.y}-${m}-${day}`;
    }
  }

  const s = String(raw).trim();
  if (!s) return null;

  // ISO / numeric format already: "2020-05-01", "01.05.2020", "01/05/2020"
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2,"0")}-${isoMatch[3].padStart(2,"0")}`;

  const dotMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (dotMatch) {
    const y = dotMatch[3].length === 2 ? `20${dotMatch[3]}` : dotMatch[3];
    return `${y}-${dotMatch[2].padStart(2,"0")}-${dotMatch[1].padStart(2,"0")}`;
  }

  // Norwegian "mai 2020", "aug.-20", "juni 2021", "apr.-21"
  // Pattern: <month_name>[.] [']<year_2_or_4>
  const noMatch = s.match(/^([a-zæøå]+)\.?\s*[-–]?\s*['']?(\d{2,4})\.?$/i);
  if (noMatch) {
    const monthStr = noMatch[1].toLowerCase().replace(/\.$/, "");
    const monthNum = NO_MONTHS[monthStr];
    if (monthNum) {
      const rawYear = noMatch[2];
      const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
      return `${year}-${String(monthNum).padStart(2, "0")}-01`;
    }
  }

  return null; // unparseable — leave as null, Review wizard flags it
}

// ── Grade normalisation ───────────────────────────────────────────────────────

// Normalise informal/colloquial Norwegian grades before lookup.
// e.g. "5er" → "5", "6er" → "6", "7-/7" → "7-", "ca. 6" → "6"
function normalizeGradeInput(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^ca\.?\s*/i, "");          // strip "ca." prefix
  s = s.replace(/^ca\s+/i, "");
  s = s.replace(/er$/i, "");                // "5er" → "5", "6er" → "6"
  s = s.replace(/^([^/]+)\/.*$/, "$1");     // "7-/7" → "7-"  (take first)
  return s.trim();
}

// ── Climb type mapping ────────────────────────────────────────────────────────

function mapProtectionToClimbType(val: string): Climb["climb_type"] | null {
  const v = val.toLowerCase().trim();
  if (v.includes("borebolter") || v.includes("bolter") || v === "sport") return "Sport";
  if (v.includes("naturlig") || v.includes("trad") || v.includes("toppanker")) return "Trad";
  if (v.includes("blanding") || v.includes("mixed")) return "Trad";
  if (v.includes("alpin") || v.includes("alpine")) return "Alpine";
  if (v.includes("bouldering") || v.includes("bloc")) return "Bouldering";
  if (v.includes("vinter") || v.includes("winter") || v.includes("is")) return "Winter";
  return null; // unmapped — will be shown as a hint
}

// ── Ascent style mapping ──────────────────────────────────────────────────────

function mapBestigningsstil(val: string): {
  style: Climb["ascent_style"];
  detail: Climb["ascent_detail"];
} {
  const v = val.toLowerCase();
  let style: Climb["ascent_style"] = null;
  let detail: Climb["ascent_detail"] = null;

  if (v.includes("onsight") || v.includes("on sight") || v.includes("på blikk") || v.includes("blikk")) {
    style = "Lead"; detail = "Onsight";
  } else if (v.includes("flash")) {
    style = "Lead"; detail = "Flash";
  } else if (v.includes("redpoint") || v.includes("rødpunkt") || v.includes("headpoint")) {
    style = "Lead"; detail = "Redpoint/Headpoint";
  } else if (v.includes("retroflash")) {
    style = "Lead"; detail = "Repeat ascent";
  } else if (v.includes("ground up") || v.includes("ground-up")) {
    style = "Lead"; detail = "Ground up";
  } else if (v.includes("topptau") || v.includes("toprope") || v.includes("top-rope") || v.includes("top rope")) {
    style = "Top-rope";
  } else if (v.includes("second") || v.includes("andretau") || v.includes("sikrer")) {
    style = "Second";
  } else if (v.includes("solo")) {
    style = "Solo";
  } else if (v.includes("boulder") || v.includes("bouldering")) {
    style = "Boulder";
  } else if (v.includes("annen") || v.includes("lead") || v.includes("leder")) {
    style = "Lead";
  }

  return { style, detail };
}

// ── Length parsing ────────────────────────────────────────────────────────────

function parseLength(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const match = String(val).match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

// ── Import ────────────────────────────────────────────────────────────────────

export function parseExcelFile(buffer: ArrayBuffer): PartialClimb[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];

  return rows.map((row) => {
    const climb: PartialClimb = { reviewed: false, is_multipitch: false };
    const hints: Record<string, string> = {};

    for (const [rawHeader, rawValue] of Object.entries(row)) {
      const normHeader = normalizeHeader(rawHeader);
      const field = HEADER_MAP[normHeader];
      if (!field) continue;

      const value = rawValue != null ? String(rawValue).trim() : null;
      if (!value) continue;

      if (field === "date") {
        const parsed = parseDate(rawValue);
        climb.date = parsed;
        if (!parsed) hints.date = value; // show original in form

      } else if (field === "grade_no") {
        const normalized = normalizeGradeInput(value);
        // Check if normalized grade is in our table
        if (NO_GRADES.includes(normalized)) {
          const { grade_no, grade_fr } = normalizeGrade(normalized, "NO");
          climb.grade_no = grade_no;
          climb.grade_fr = grade_fr;
          climb.grade_system = "NO";
        } else {
          // Try French grades
          const { grade_no: gno, grade_fr: gfr } = normalizeGrade(normalized, "FR");
          if (gno) {
            climb.grade_no = gno;
            climb.grade_fr = gfr;
            climb.grade_system = "FR";
          } else {
            // Can't map — store hint for display
            hints.grade = value;
          }
        }

      } else if (field === "length_m") {
        climb.length_m = parseLength(rawValue as string | number);

      } else if (field === "climb_type") {
        const mapped = mapProtectionToClimbType(value);
        climb.climb_type = mapped;
        if (!mapped) hints.climb_type = value; // show original

      } else if (field === "ascent_style") {
        const mapped = mapBestigningsstil(value);
        climb.ascent_style = mapped.style;
        climb.ascent_detail = mapped.detail;
        if (!mapped.style) hints.ascent_style = value; // show original

      } else {
        // @ts-expect-error dynamic assignment
        climb[field] = value;
      }
    }

    // Always derive ascent_result from whatever (style, detail) ended up on
    // the row — even for imports, so the bulk insert writes a correct value
    // instead of leaving it null and waiting for a backfill.
    climb.ascent_result = deriveAscentResult(
      climb.ascent_style ?? null,
      climb.ascent_detail ?? null,
    );

    if (Object.keys(hints).length > 0) {
      climb._importHints = hints;
    }

    return climb;
  });
}

// ── Export ────────────────────────────────────────────────────────────────────

const EXPORT_HEADERS = [
  "Dato",
  "Navn på rute",
  "Klatrefelt/Fjell",
  "Rutegrad (NO)",
  "Rutegrad (FR)",
  "Enkeltlengde/Flerlengde",
  "Lengde på ruten",
  "Klatretype",
  "Type sikringer",
  "Bestigningsstil",
  "Bestigningsdetalj",
  "Result",
  "Værforhold",
  "Klatrepartner",
  "Merknader",
];

function climbToRow(c: Climb): Record<string, string | number | null> {
  return {
    Dato: c.date ?? "",
    "Navn på rute": c.route_name ?? "",
    "Klatrefelt/Fjell": c.crag ?? "",
    "Rutegrad (NO)": c.grade_no ?? "",
    "Rutegrad (FR)": c.grade_fr ?? "",
    "Enkeltlengde/Flerlengde": c.is_multipitch ? "Flerlengde" : "Enkeltlengde",
    "Lengde på ruten": c.length_m ?? "",
    Klatretype: c.climb_type ?? "",
    "Type sikringer": c.climb_type ?? "",
    Bestigningsstil: c.ascent_style ?? "",
    Bestigningsdetalj: c.ascent_detail ?? "",
    Result: c.ascent_result ? RESULT_LABEL[c.ascent_result] : "",
    Værforhold: c.weather ?? "",
    Klatrepartner: c.partner ?? "",
    Merknader: c.notes ?? "",
  };
}

export function exportToXlsx(climbs: Climb[]): void {
  const rows = climbs.map(climbToRow);
  const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Klatredagbok");
  XLSX.writeFile(wb, "klatredagbok.xlsx");
}

export function exportToCsv(climbs: Climb[]): void {
  const rows = climbs.map(climbToRow);
  const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_HEADERS });
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "klatredagbok.csv";
  a.click();
  URL.revokeObjectURL(url);
}
