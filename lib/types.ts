export type GradeSystem = "NO" | "FR";

export type ClimbType =
  | "Trad"
  | "Sport"
  | "Mixed"
  | "Bouldering"
  | "Alpine"
  | "Scrambling"
  | "Winter";

export type AscentStyle =
  | "Lead"
  | "Solo"
  | "Second"
  | "Top-rope"
  | "Boulder"
  | "DWS"
  | "Alternate Leads";

export type AscentDetail =
  | "Onsight"
  | "Flash"
  | "Ground up"
  | "Redpoint/Headpoint"
  | "Repeat ascent"
  | "With falls/rests"
  | "Did not finish";

// Did the climber send the route, or were they working it?
// Always derived from (ascent_style, ascent_detail) — never edited directly.
export type AscentResult = "Send" | "Working";

// English display labels (the rest of the UI is in Norwegian, but the user
// explicitly wants Send / Working attempt for these new annotations).
export const RESULT_LABEL: Record<AscentResult, string> = {
  Send: "Send",
  Working: "Working attempt",
};

export interface Pitch {
  pitch: number;
  grade_no: string | null;
  grade_fr: string | null;
  length_m: number | null;
}

export interface Climb {
  id: string;
  date: string | null;            // ISO date string, e.g. "2024-05-01"
  route_name: string | null;
  crag: string | null;
  grade_system: GradeSystem | null;
  grade_no: string | null;
  grade_fr: string | null;
  is_multipitch: boolean;
  pitches: Pitch[] | null;
  length_m: number | null;
  climb_type: ClimbType | null;
  ascent_style: AscentStyle | null;
  ascent_detail: AscentDetail | null;
  ascent_result: AscentResult | null;
  weather: string | null;
  partner: string | null;
  notes: string | null;
  attempts: number | null;
  reviewed: boolean;
  created_at: string;
}

export type NewClimb = Omit<Climb, "id" | "created_at">;
export type PartialClimb = Partial<Omit<Climb, "id" | "created_at">> & {
  // Raw original values from import, shown as hints in EntryForm but NOT saved to DB
  _importHints?: Partial<Record<string, string>>;
};

// Which ascent_detail options are valid for a given ascent_style
export const STYLE_DETAILS: Record<AscentStyle, AscentDetail[]> = {
  Lead: ["Onsight", "Flash", "Ground up", "Redpoint/Headpoint", "Repeat ascent", "With falls/rests", "Did not finish"],
  Solo: ["Onsight", "Flash", "Ground up", "Redpoint/Headpoint", "Repeat ascent", "With falls/rests", "Did not finish"],
  DWS: ["Onsight", "Flash", "Ground up", "Redpoint/Headpoint", "Repeat ascent", "With falls/rests", "Did not finish"],
  "Alternate Leads": ["Onsight", "Flash", "Ground up", "Redpoint/Headpoint", "Repeat ascent"],
  Boulder: ["Onsight", "Flash", "Repeat ascent", "With falls/rests", "Did not finish"],
  Second: ["Onsight", "Flash", "Repeat ascent", "With falls/rests", "Did not finish"],
  "Top-rope": ["Onsight", "Flash", "Repeat ascent", "With falls/rests", "Did not finish"],
};

// Derive Send/Working from the existing (style, detail) pair.
// Order matters — earlier rules win. Mirrors the SQL backfill in
// supabase/schema.sql.
export function deriveAscentResult(
  style: AscentStyle | null,
  detail: AscentDetail | null,
): AscentResult | null {
  if (!style && !detail) return null;
  // 1. Top-rope is always Working
  if (style === "Top-rope") return "Working";
  // 2. Second: working if hung/bailed, otherwise judge by detail
  if (style === "Second") {
    if (detail === "With falls/rests" || detail === "Did not finish") return "Working";
    if (detail === "Onsight" || detail === "Flash" || detail === "Repeat ascent") return "Send";
    return null;
  }
  // 3. Bailed or hung on the rope/boulder
  if (detail === "Did not finish" || detail === "With falls/rests") return "Working";
  // 4. Anything else with a clean detail is a Send
  if (
    detail === "Onsight" || detail === "Flash" || detail === "Ground up" ||
    detail === "Redpoint/Headpoint" || detail === "Repeat ascent"
  ) return "Send";
  return null;
}

// Display helper: "Onsight (Send)", "With falls/rests (Working attempt)",
// or just "Onsight" if the result can't be determined.
export function formatDetailWithResult(
  style: AscentStyle | null,
  detail: AscentDetail | null,
): string {
  if (!detail) return "";
  const result = deriveAscentResult(style, detail);
  return result ? `${detail} (${RESULT_LABEL[result]})` : detail;
}
