import { getSupabase } from "./supabase";
import { deriveAscentResult } from "./types";
import type { Climb, NewClimb, PartialClimb } from "./types";

// Recompute ascent_result from (style, detail) on every write so the stored
// field can never drift out of sync with the source-of-truth fields. Strips
// the _importHints field (review-only) before sending to Supabase.
function withDerivedResult<T extends Partial<Climb> & { _importHints?: unknown }>(
  climb: T,
): Omit<T, "_importHints"> {
  const { _importHints: _ignored, ...rest } = climb;
  void _ignored;
  return {
    ...rest,
    ascent_result: deriveAscentResult(
      rest.ascent_style ?? null,
      rest.ascent_detail ?? null,
    ),
  };
}

export async function insertClimb(climb: NewClimb): Promise<Climb> {
  const { data, error } = await getSupabase()
    .from("climbs")
    .insert(withDerivedResult(climb))
    .select()
    .single();
  if (error) throw error;
  return data as Climb;
}

export async function updateClimb(id: string, changes: PartialClimb): Promise<Climb> {
  const { data, error } = await getSupabase()
    .from("climbs")
    .update(withDerivedResult(changes))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Climb;
}

export async function deleteClimb(id: string): Promise<void> {
  const { error } = await getSupabase().from("climbs").delete().eq("id", id);
  if (error) throw error;
}

export async function getAllClimbs(): Promise<Climb[]> {
  const { data, error } = await getSupabase()
    .from("climbs")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Climb[];
}

export async function getUnreviewedClimbs(): Promise<Climb[]> {
  const { data, error } = await getSupabase()
    .from("climbs")
    .select("*")
    .eq("reviewed", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Climb[];
}

export async function bulkInsertClimbs(climbs: NewClimb[]): Promise<Climb[]> {
  const { data, error } = await getSupabase()
    .from("climbs")
    .insert(climbs.map(withDerivedResult))
    .select();
  if (error) throw error;
  return (data ?? []) as Climb[];
}

/** Returns distinct non-null crag names, sorted alphabetically. */
export async function getDistinctCrags(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("climbs")
    .select("crag")
    .not("crag", "is", null);
  if (error) throw error;
  const unique = [...new Set((data ?? []).map((r: { crag: string }) => r.crag).filter(Boolean))];
  return unique.sort();
}

/** Returns distinct non-null route names, sorted alphabetically. */
export async function getDistinctRoutes(): Promise<{ route_name: string; crag: string | null; count: number }[]> {
  const { data, error } = await getSupabase()
    .from("climbs")
    .select("route_name, crag");
  if (error) throw error;
  // Group by route_name, pick the most recent crag association and count attempts
  const map = new Map<string, { crag: string | null; count: number }>();
  for (const row of data ?? []) {
    if (!row.route_name) continue;
    const existing = map.get(row.route_name);
    if (existing) {
      existing.count++;
      if (!existing.crag && row.crag) existing.crag = row.crag;
    } else {
      map.set(row.route_name, { crag: row.crag ?? null, count: 1 });
    }
  }
  return [...map.entries()]
    .map(([route_name, { crag, count }]) => ({ route_name, crag, count }))
    .sort((a, b) => a.route_name.localeCompare(b.route_name));
}

/** Returns distinct non-null partner names, sorted alphabetically. */
export async function getDistinctPartners(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("climbs")
    .select("partner")
    .not("partner", "is", null);
  if (error) throw error;
  const unique = [...new Set((data ?? []).map((r: { partner: string }) => r.partner).filter(Boolean))];
  return unique.sort();
}

/** Returns all previous ascents of a given route name. */
export async function getRouteHistory(routeName: string): Promise<Climb[]> {
  const { data, error } = await getSupabase()
    .from("climbs")
    .select("*")
    .eq("route_name", routeName)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Climb[];
}
