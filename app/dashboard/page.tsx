"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useRef } from "react";
import type { Climb, NewClimb, AscentResult } from "@/lib/types";
import { RESULT_LABEL } from "@/lib/types";
import { getAllClimbs, deleteClimb, updateClimb } from "@/lib/db";
import { NO_GRADES, FR_GRADES } from "@/lib/grades";
import { exportToXlsx, exportToCsv } from "@/lib/excel";
import { EntryForm } from "@/components/entry-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Download, HardDrive, ChevronDown, ChevronUp, X } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

function countBy<T>(items: T[], key: (item: T) => string | null | undefined): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item) ?? "Ukjent";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, count]) => ({ name, count }));
}

// Aggregated stats for one route (route_name + crag). Used by the Biggest
// Project widget and the Avg sessions to send KPI.
type ProjectBucket = {
  route: string;
  crag: string | null;
  sends: number;
  working: number;
  total: number;
  topGrade: string | null;
  firstSendDate: string | null;
  // Number of distinct attempt-days strictly before the first send.
  // null if the route has never been sent.
  sessionsToSend: number | null;
};

// ── Multi-select pill component ───────────────────────────────────────────────

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter((x) => x !== opt) : [...value, opt]);
  }
  return (
    <div className="space-y-1 relative">
      <Label className="text-xs">{label}</Label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus:outline-none"
      >
        <span className="truncate text-left">
          {value.length === 0 ? <span className="text-muted-foreground">Alle</span> : value.join(", ")}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground ml-1" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
                className="size-3.5 accent-primary"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

interface Filters {
  search: string;
  crags: string[];
  gradeMin: string;
  gradeMax: string;
  ascentStyles: string[];
  ascentDetails: string[];
  climbTypes: string[];
  partners: string[];
  dateFrom: string;
  dateTo: string;
  year: string;
  // Empty array = no filter ("All"); one or more values narrow to those results.
  result: AscentResult[];
}

const EMPTY_FILTERS: Filters = {
  search: "",
  crags: [],
  gradeMin: "",
  gradeMax: "",
  ascentStyles: [],
  ascentDetails: [],
  climbTypes: [],
  partners: [],
  dateFrom: "",
  dateTo: "",
  year: "",
  result: [],
};

function applyFilters(climbs: Climb[], f: Filters, gradeSystem: "NO" | "FR"): Climb[] {
  const gradeArr = gradeSystem === "NO" ? NO_GRADES : FR_GRADES;
  const gradeField = gradeSystem === "NO" ? "grade_no" : "grade_fr" as const;
  return climbs.filter((c) => {
    if (f.search) {
      const q = f.search.toLowerCase();
      if (
        !c.route_name?.toLowerCase().includes(q) &&
        !c.crag?.toLowerCase().includes(q) &&
        !c.notes?.toLowerCase().includes(q)
      ) return false;
    }
    if (f.year && (!c.date || !c.date.startsWith(f.year))) return false;
    if (f.crags.length > 0 && !f.crags.includes(c.crag ?? "")) return false;
    if (f.ascentStyles.length > 0 && !f.ascentStyles.includes(c.ascent_style ?? "")) return false;
    if (f.ascentDetails.length > 0 && !f.ascentDetails.includes(c.ascent_detail ?? "")) return false;
    if (f.climbTypes.length > 0 && !f.climbTypes.includes(c.climb_type ?? "")) return false;
    if (f.partners.length > 0 && !f.partners.includes(c.partner ?? "")) return false;
    if (f.result.length > 0 && (!c.ascent_result || !f.result.includes(c.ascent_result))) return false;
    if (f.dateFrom && c.date && c.date < f.dateFrom) return false;
    if (f.dateTo && c.date && c.date > f.dateTo) return false;
    const gradeVal = c[gradeField];
    if (f.gradeMin && gradeVal) {
      if (gradeArr.indexOf(gradeVal) < gradeArr.indexOf(f.gradeMin)) return false;
    }
    if (f.gradeMax && gradeVal) {
      if (gradeArr.indexOf(gradeVal) > gradeArr.indexOf(f.gradeMax)) return false;
    }
    return true;
  });
}

function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.search) n++;
  if (f.crags.length) n++;
  if (f.gradeMin || f.gradeMax) n++;
  if (f.ascentStyles.length) n++;
  if (f.ascentDetails.length) n++;
  if (f.climbTypes.length) n++;
  if (f.partners.length) n++;
  if (f.dateFrom || f.dateTo) n++;
  if (f.result.length) n++;
  return n;
}

// ── Sort ──────────────────────────────────────────────────────────────────────

type SortKey = "date" | "route_name" | "crag" | "grade" | "ascent_style";

function sortClimbs(climbs: Climb[], key: SortKey, dir: "asc" | "desc", gradeSystem: "NO" | "FR"): Climb[] {
  const gradeArr = gradeSystem === "NO" ? NO_GRADES : FR_GRADES;
  const gradeField = gradeSystem === "NO" ? "grade_no" : "grade_fr" as const;
  const mul = dir === "asc" ? 1 : -1;
  return [...climbs].sort((a, b) => {
    if (key === "grade") {
      let ai = gradeArr.indexOf(a[gradeField] ?? "");
      let bi = gradeArr.indexOf(b[gradeField] ?? "");
      if (ai === -1) ai = 9999;
      if (bi === -1) bi = 9999;
      return mul * (ai - bi);
    }
    const av = a[key] ?? "";
    const bv = b[key] ?? "";
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    return mul * String(av).localeCompare(String(bv));
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function DashboardPage() {
  const [allClimbs, setAllClimbs] = useState<Climb[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [gradeSystem, setGradeSystem] = useState<"NO" | "FR">("NO");
  const [timeGranularity, setTimeGranularity] = useState<"month" | "year">("month");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState(false);
  const [editingClimb, setEditingClimb] = useState<Climb | null>(null);

  // Refs/state for the "jump to climbs list" behaviour on hardest cards.
  const climbsTableRef = useRef<HTMLDivElement>(null);
  // Second (near-list) collapsible filter panel has its own open state so
  // the user can expand it independently from the top one.
  const [showFiltersBottom, setShowFiltersBottom] = useState(false);

  useEffect(() => {
    getAllClimbs()
      .then(setAllClimbs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Reset visible count when filters/sort change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filters, sort, gradeSystem]);

  const filtered = useMemo(
    () => applyFilters(allClimbs, filters, gradeSystem),
    [allClimbs, filters, gradeSystem]
  );

  const sorted = useMemo(
    () => sortClimbs(filtered, sort.key, sort.dir, gradeSystem),
    [filtered, sort, gradeSystem]
  );

  const filterCount = useMemo(() => activeFilterCount(filters), [filters]);

  const distinctYears = useMemo(() => {
    const years = new Set<string>();
    for (const c of allClimbs) if (c.date) years.add(c.date.slice(0, 4));
    return [...years].sort();
  }, [allClimbs]);

  const distinctCrags = useMemo(
    () => [...new Set(allClimbs.map((c) => c.crag).filter(Boolean) as string[])].sort(),
    [allClimbs]
  );
  const distinctPartners = useMemo(
    () => [...new Set(allClimbs.map((c) => c.partner).filter(Boolean) as string[])].sort(),
    [allClimbs]
  );
  const distinctStyles = useMemo(
    () => [...new Set(allClimbs.map((c) => c.ascent_style).filter(Boolean) as string[])].sort(),
    [allClimbs]
  );
  const distinctDetails = useMemo(
    () => [...new Set(allClimbs.map((c) => c.ascent_detail).filter(Boolean) as string[])].sort(),
    [allClimbs]
  );
  const distinctTypes = useMemo(
    () => [...new Set(allClimbs.map((c) => c.climb_type).filter(Boolean) as string[])].sort(),
    [allClimbs]
  );

  const gradeArr = gradeSystem === "NO" ? NO_GRADES : FR_GRADES;
  const gradeField = gradeSystem === "NO" ? "grade_no" : "grade_fr" as const;

  const totalClimbs = filtered.length;
  const uniqueCrags = new Set(filtered.map((c) => c.crag).filter(Boolean)).size;

  // Generic "hardest climb matching predicate" helper. Falls back to null if
  // nothing matches or no climb has a grade in the current system.
  function hardestBy(predicate: (c: Climb) => boolean): Climb | null {
    return filtered
      .filter((c) => predicate(c) && c[gradeField])
      .reduce<Climb | null>((best, c) => {
        const idx = gradeArr.indexOf(c[gradeField]!);
        if (idx === -1) return best;
        if (!best) return c;
        return idx > gradeArr.indexOf(best[gradeField]!) ? c : best;
      }, null);
  }

  const hardestSendClimb = hardestBy((c) => c.ascent_result === "Send");
  const hardestWorkedClimb = hardestBy((c) => c.ascent_result === "Working");
  const hardestOnsightClimb = hardestBy(
    (c) => c.ascent_result === "Send" && c.ascent_detail === "Onsight",
  );
  const hardestRedpointClimb = hardestBy(
    (c) =>
      c.ascent_result === "Send" &&
      (c.ascent_detail === "Redpoint/Headpoint" ||
        c.ascent_detail === "Ground up" ||
        c.ascent_detail === "Repeat ascent"),
  );

  const byTime = useMemo(() => {
    if (filtered.length === 0) return [];
    const dates = filtered
      .map((c) => c.date)
      .filter((d): d is string => !!d)
      .sort();
    if (dates.length === 0) return [];

    const first = dates[0];
    const last = dates[dates.length - 1];

    const keyOf = (iso: string) =>
      timeGranularity === "month" ? iso.slice(0, 7) : iso.slice(0, 4);

    const counts = new Map<string, number>();
    for (const c of filtered) {
      if (!c.date) continue;
      const k = keyOf(c.date);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    // Generate the full set of buckets between first and last (inclusive),
    // INCLUDING zero-count buckets so the line is continuous across gaps.
    const buckets: { label: string; count: number }[] = [];
    if (timeGranularity === "month") {
      const [fy, fm] = first.split("-").map(Number);
      const [ly, lm] = last.split("-").map(Number);
      let y = fy;
      let m = fm;
      while (y < ly || (y === ly && m <= lm)) {
        const k = `${y}-${String(m).padStart(2, "0")}`;
        buckets.push({ label: k, count: counts.get(k) ?? 0 });
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    } else {
      const fy = Number(first.slice(0, 4));
      const ly = Number(last.slice(0, 4));
      for (let y = fy; y <= ly; y++) {
        const k = String(y);
        buckets.push({ label: k, count: counts.get(k) ?? 0 });
      }
    }
    return buckets;
  }, [filtered, timeGranularity]);

  const byGrade = useMemo(() => {
    const field = gradeSystem === "NO" ? "grade_no" : "grade_fr" as const;
    const arr = gradeSystem === "NO" ? NO_GRADES : FR_GRADES;
    const counts = countBy(filtered, (c) => c[field]);
    return arr.map((g) => ({ grade: g, count: counts.find((x) => x.name === g)?.count ?? 0 })).filter((x) => x.count > 0);
  }, [filtered, gradeSystem]);

  const byStyle = useMemo(() => countBy(filtered, (c) => c.ascent_style), [filtered]);
  const byType = useMemo(() => countBy(filtered, (c) => c.climb_type), [filtered]);
  const topCrags = useMemo(
    () => countBy(filtered, (c) => c.crag).sort((a, b) => b.count - a.count).slice(0, 10),
    [filtered]
  );

  const routeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of allClimbs) {
      if (c.route_name) {
        const k = `${c.route_name}|||${c.crag ?? ""}`;
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
    return map;
  }, [allClimbs]);

  // Per-route aggregation: totals, send/attempt split, top grade, first send
  // date, and sessions-to-send. Powers the Biggest Project widget and the
  // Avg sessions to send KPI.
  const projectStats = useMemo(() => {
    const map = new Map<string, ProjectBucket>();
    for (const c of allClimbs) {
      if (!c.route_name) continue;
      const k = `${c.route_name}|||${c.crag ?? ""}`;
      const b: ProjectBucket =
        map.get(k) ?? {
          route: c.route_name,
          crag: c.crag,
          sends: 0,
          working: 0,
          total: 0,
          topGrade: null,
          firstSendDate: null,
          sessionsToSend: null,
        };
      b.total += 1;
      if (c.ascent_result === "Send") b.sends += 1;
      else if (c.ascent_result === "Working") b.working += 1;
      const g = c[gradeField];
      if (g && (!b.topGrade || gradeArr.indexOf(g) > gradeArr.indexOf(b.topGrade))) {
        b.topGrade = g;
      }
      if (
        c.ascent_result === "Send" &&
        c.date &&
        (!b.firstSendDate || c.date < b.firstSendDate)
      ) {
        b.firstSendDate = c.date;
      }
      map.set(k, b);
    }
    // Second pass: distinct attempt-days strictly before the first send.
    for (const b of map.values()) {
      if (!b.firstSendDate) continue;
      const days = new Set<string>();
      for (const c of allClimbs) {
        if (!c.route_name) continue;
        if (c.route_name !== b.route || (c.crag ?? "") !== (b.crag ?? "")) continue;
        if (c.date && c.date < b.firstSendDate) days.add(c.date);
      }
      b.sessionsToSend = days.size;
    }
    return [...map.values()];
  }, [allClimbs, gradeField, gradeArr]);

  const biggestProject = useMemo(
    () => [...projectStats].sort((a, b) => b.total - a.total)[0] ?? null,
    [projectStats],
  );

  // Sessions-to-send aggregate: only count routes where the climber actually
  // worked the route before sending (sessionsToSend > 0). Routes that were
  // flashed have sessionsToSend === 0 and are excluded — they'd skew the
  // average toward zero without saying anything about projecting effort.
  const { avgSessionsToSend, sentProjectCount } = useMemo(() => {
    const withWork = projectStats.filter(
      (p) => p.sessionsToSend !== null && p.sessionsToSend > 0,
    );
    if (withWork.length === 0) {
      return { avgSessionsToSend: null as number | null, sentProjectCount: 0 };
    }
    const avg =
      withWork.reduce((sum, p) => sum + (p.sessionsToSend ?? 0) + 1, 0) /
      withWork.length;
    return { avgSessionsToSend: avg, sentProjectCount: withWork.length };
  }, [projectStats]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  // Click handler for the "Hardest X" KPI cards: filter the climbs list to
  // the clicked route and scroll the list into view so the climber can
  // inspect every ascent that contributed to that grade.
  function jumpToRoute(routeName: string | null | undefined) {
    if (!routeName) return;
    setFilter("search", routeName);
    // Defer scroll so React has a chance to re-render with the new filter.
    requestAnimationFrame(() => {
      climbsTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function selectChange(key: keyof Filters) {
    return (v: string | null) => setFilter(key, (v === "_all" || v === null) ? "" : v as never);
  }

  function toggleSort(key: SortKey) {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  async function handleEdit(data: NewClimb) {
    if (!editingClimb) return;
    await updateClimb(editingClimb.id, { ...data, reviewed: true });
    setAllClimbs((prev) => prev.map((c) => c.id === editingClimb.id ? { ...c, ...data } : c));
    setEditingClimb(null);
  }

  async function handleDelete(id: string) {
    setDeletingInProgress(true);
    try {
      await deleteClimb(id);
      setAllClimbs((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeletingInProgress(false);
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">Oversikt</h1>
        <p className="text-muted-foreground text-sm">Laster…</p>
      </div>
    );
  }

  if (editingClimb) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => setEditingClimb(null)} className="-ml-2 mb-3">
          ← Tilbake
        </Button>
        <p className="font-medium mb-4">{editingClimb.route_name ?? "Ukjent rute"}</p>
        <button
          form="edit-form"
          type="submit"
          className="w-full mb-4 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Lagre endringer
        </button>
        <EntryForm
          formId="edit-form"
          key={editingClimb.id}
          initialData={editingClimb}
          onSubmit={handleEdit}
          submitLabel="Lagre endringer"
        />
      </div>
    );
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sort.key !== col) return <span className="text-muted-foreground/40 ml-0.5">↕</span>;
    return <span className="text-primary ml-0.5">{sort.dir === "asc" ? "↑" : "↓"}</span>;
  }

  // Renders the collapsible filter panel. Used twice — once at the top of
  // the page and once right above the climbs table — each with its own
  // open/closed state but sharing the same underlying `filters` state.
  function renderFilterPanel(
    open: boolean,
    setOpen: (v: boolean) => void,
  ) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          Filtre{filterCount > 0 ? ` (${filterCount})` : ""}
        </button>

        {open && (
          <div className="mt-3 space-y-3 rounded-xl bg-card ring-1 ring-foreground/10 p-4">
            <Input
              placeholder="Søk rute, felt, notater…"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <MultiSelect label="Felt" options={distinctCrags} value={filters.crags} onChange={(v) => setFilter("crags", v)} />
              <MultiSelect label="Klatretype" options={distinctTypes} value={filters.climbTypes} onChange={(v) => setFilter("climbTypes", v)} />
              <MultiSelect label="Stil" options={distinctStyles} value={filters.ascentStyles} onChange={(v) => setFilter("ascentStyles", v)} />
              <MultiSelect label="Detalj" options={distinctDetails} value={filters.ascentDetails} onChange={(v) => setFilter("ascentDetails", v)} />
              <MultiSelect label="Partner" options={distinctPartners} value={filters.partners} onChange={(v) => setFilter("partners", v)} />
              <MultiSelect
                label="Result"
                options={["Send", "Working"]}
                value={filters.result}
                onChange={(v) => setFilter("result", v as AscentResult[])}
              />

              <div className="space-y-1">
                <Label className="text-xs">Min. grad ({gradeSystem})</Label>
                <Select value={filters.gradeMin} onValueChange={selectChange("gradeMin")}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">—</SelectItem>
                    {gradeArr.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fra dato</Label>
                <Input type="date" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Til dato</Label>
                <Input type="date" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} />
              </div>
            </div>

            {filterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, year: f.year, result: f.result }))}
              >
                Nullstill filtre
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + grade toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Oversikt</h1>
        <div className="flex rounded-lg border border-input overflow-hidden text-sm">
          {(["NO", "FR"] as const).map((sys) => (
            <button
              key={sys}
              type="button"
              onClick={() => setGradeSystem(sys)}
              className={`px-3 py-1 transition-colors ${
                gradeSystem === sys ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {sys}
            </button>
          ))}
        </div>
      </div>

      {/* Year pills */}
      {distinctYears.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {["", ...distinctYears].map((y) => (
            <button
              key={y || "all"}
              type="button"
              onClick={() => setFilter("year", y)}
              className={`shrink-0 px-3 py-1 rounded-full text-sm transition-colors ${
                filters.year === y ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {y || "Alle"}
            </button>
          ))}
        </div>
      )}

      {/* Result quick-toggle: Sent / Worked / All */}
      <div className="flex gap-2">
        {(
          [
            { key: "all", label: "All", value: [] as AscentResult[] },
            { key: "send", label: "Sent", value: ["Send" as AscentResult] },
            { key: "working", label: "Worked", value: ["Working" as AscentResult] },
          ]
        ).map(({ key, label, value }) => {
          const active =
            filters.result.length === value.length &&
            value.every((v) => filters.result.includes(v));
          const activeClass =
            key === "send"
              ? "bg-emerald-500 text-white"
              : key === "working"
              ? "bg-amber-500 text-white"
              : "bg-primary text-primary-foreground";
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter("result", value)}
              className={`shrink-0 px-3 py-1 rounded-full text-sm transition-colors ${
                active ? activeClass : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Filters toggle (top instance) */}
      {renderFilterPanel(showFilters, setShowFilters)}

      {/* Active filter chips */}
      {filterCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.search && (
            <Chip label={`"${filters.search}"`} onRemove={() => setFilter("search", "")} />
          )}
          {filters.crags.map((v) => <Chip key={v} label={v} onRemove={() => setFilter("crags", filters.crags.filter((x) => x !== v))} />)}
          {filters.climbTypes.map((v) => <Chip key={v} label={v} onRemove={() => setFilter("climbTypes", filters.climbTypes.filter((x) => x !== v))} />)}
          {filters.ascentStyles.map((v) => <Chip key={v} label={v} onRemove={() => setFilter("ascentStyles", filters.ascentStyles.filter((x) => x !== v))} />)}
          {filters.ascentDetails.map((v) => <Chip key={v} label={v} onRemove={() => setFilter("ascentDetails", filters.ascentDetails.filter((x) => x !== v))} />)}
          {filters.partners.map((v) => <Chip key={v} label={v} onRemove={() => setFilter("partners", filters.partners.filter((x) => x !== v))} />)}
          {filters.result.map((v) => (
            <Chip
              key={v}
              label={RESULT_LABEL[v]}
              accent={v === "Send" ? "emerald" : "amber"}
              onRemove={() => setFilter("result", filters.result.filter((x) => x !== v))}
            />
          ))}
          {filters.gradeMin && <Chip label={`≥ ${filters.gradeMin}`} onRemove={() => setFilter("gradeMin", "")} />}
          {filters.gradeMax && <Chip label={`≤ ${filters.gradeMax}`} onRemove={() => setFilter("gradeMax", "")} />}
          {filters.dateFrom && <Chip label={`Fra ${fmtDate(filters.dateFrom)}`} onRemove={() => setFilter("dateFrom", "")} />}
          {filters.dateTo && <Chip label={`Til ${fmtDate(filters.dateTo)}`} onRemove={() => setFilter("dateTo", "")} />}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Klatringer" value={String(totalClimbs)} />
        <KpiCard label="Felt" value={String(uniqueCrags)} />
        <KpiCard
          label={`Hardest send (${gradeSystem})`}
          value={hardestSendClimb?.[gradeField] ?? "—"}
          routeName={hardestSendClimb?.route_name}
          sub={hardestSendClimb ? fmtDate(hardestSendClimb.date) : undefined}
          accent="emerald"
          onClick={
            hardestSendClimb?.route_name
              ? () => jumpToRoute(hardestSendClimb.route_name)
              : undefined
          }
        />
        <KpiCard
          label={`Hardest worked (${gradeSystem})`}
          value={hardestWorkedClimb?.[gradeField] ?? "—"}
          routeName={hardestWorkedClimb?.route_name}
          sub={hardestWorkedClimb ? fmtDate(hardestWorkedClimb.date) : undefined}
          accent="amber"
          onClick={
            hardestWorkedClimb?.route_name
              ? () => jumpToRoute(hardestWorkedClimb.route_name)
              : undefined
          }
        />
        <KpiCard
          label={`Hardest onsight (${gradeSystem})`}
          value={hardestOnsightClimb?.[gradeField] ?? "—"}
          routeName={hardestOnsightClimb?.route_name}
          sub={hardestOnsightClimb ? fmtDate(hardestOnsightClimb.date) : undefined}
          accent="emerald"
          onClick={
            hardestOnsightClimb?.route_name
              ? () => jumpToRoute(hardestOnsightClimb.route_name)
              : undefined
          }
        />
        <KpiCard
          label={`Hardest redpoint (${gradeSystem})`}
          value={hardestRedpointClimb?.[gradeField] ?? "—"}
          routeName={hardestRedpointClimb?.route_name}
          sub={hardestRedpointClimb ? fmtDate(hardestRedpointClimb.date) : undefined}
          accent="emerald"
          onClick={
            hardestRedpointClimb?.route_name
              ? () => jumpToRoute(hardestRedpointClimb.route_name)
              : undefined
          }
        />
        {avgSessionsToSend !== null && (
          <KpiCard
            label="Avg sessions to send"
            value={avgSessionsToSend.toFixed(1)}
            sub={`across ${sentProjectCount} sent routes`}
          />
        )}
        {biggestProject && (
          <BiggestProjectCard project={biggestProject} />
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen klatringer matcher filtrene.</p>
      ) : (
        <>
          {byTime.length > 1 && (
            <ChartCard
              title="Climbs over time"
              action={
                <div className="flex rounded-lg border border-input overflow-hidden text-xs">
                  {(["month", "year"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setTimeGranularity(g)}
                      className={`px-2 py-0.5 transition-colors ${
                        timeGranularity === g
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {g === "month" ? "M" : "Y"}
                    </button>
                  ))}
                </div>
              }
            >
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={byTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {byGrade.length > 0 && (
            <ChartCard title={`Etter grad (${gradeSystem})`}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={byGrade}>
                  <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {byStyle.length > 0 && (
            <ChartCard title="Etter bestigningsstil">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={byStyle}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {byType.length > 0 && (
            <ChartCard title="Etter klatretype">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={byType}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {topCrags.length > 0 && (
            <ChartCard title="Topp 10 felt">
              <ResponsiveContainer width="100%" height={Math.max(120, topCrags.length * 28)}>
                <BarChart data={topCrags} layout="vertical">
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--color-chart-4)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Result table */}
          <div ref={climbsTableRef} className="space-y-3 scroll-mt-4">
            {renderFilterPanel(showFiltersBottom, setShowFiltersBottom)}
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-sm">{filtered.length} klatringer</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportToXlsx(allClimbs)} title="Sikkerhetskopier alle">
                  <HardDrive className="size-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportToXlsx(filtered)}>
                  <Download className="size-3.5" /> xlsx
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportToCsv(filtered)}>
                  <Download className="size-3.5" /> csv
                </Button>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden ring-1 ring-foreground/10">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {(["date", "route_name", "crag", "grade", "ascent_style"] as SortKey[]).map((col, i) => (
                      <th
                        key={col}
                        className={`text-left px-3 py-2 ${i === 2 || i === 4 ? "hidden sm:table-cell" : ""}`}
                      >
                        <button
                          className="flex items-center gap-0.5 font-medium text-muted-foreground text-sm"
                          onClick={() => toggleSort(col)}
                        >
                          {col === "date" ? "Dato" : col === "route_name" ? "Rute" : col === "crag" ? "Felt" : col === "grade" ? "Grad" : "Stil"}
                          <SortIcon col={col} />
                        </button>
                      </th>
                    ))}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sorted.slice(0, visibleCount).map((c) => {
                    const repeatKey = `${c.route_name ?? ""}|||${c.crag ?? ""}`;
                    const repeatCount = c.route_name ? (routeCounts.get(repeatKey) ?? 1) : 1;
                    const isConfirming = deletingId === c.id;
                    const resultTint =
                      c.ascent_result === "Send"
                        ? "bg-emerald-500/5 hover:bg-emerald-500/10"
                        : c.ascent_result === "Working"
                        ? "bg-amber-500/5 hover:bg-amber-500/10"
                        : "hover:bg-muted/30";
                    return (
                      <tr
                        key={c.id}
                        className={`${resultTint} transition-colors cursor-pointer`}
                        onClick={() => { if (deletingId !== c.id) setEditingClimb(c); }}
                      >
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(c.date)}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{c.route_name ?? "—"}</span>
                          {repeatCount > 1 && (
                            <Badge variant="secondary" className="ml-1.5 text-xs">×{repeatCount}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{c.crag ?? "—"}</td>
                        <td className="px-3 py-2">{(gradeSystem === "NO" ? c.grade_no : c.grade_fr) ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                          {[c.ascent_style, c.ascent_detail].filter(Boolean).join(" · ") || "—"}
                          {c.ascent_result && (
                            <span
                              className={`ml-1.5 text-[10px] uppercase tracking-wide ${
                                c.ascent_result === "Send" ? "text-emerald-500" : "text-amber-500"
                              }`}
                            >
                              · {RESULT_LABEL[c.ascent_result]}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {isConfirming ? (
                            <span className="flex items-center gap-1 justify-end">
                              <button onClick={() => handleDelete(c.id)} disabled={deletingInProgress} className="text-xs text-destructive hover:underline disabled:opacity-50">
                                {deletingInProgress ? "…" : "Slett"}
                              </button>
                              <button onClick={() => setDeletingId(null)} className="text-xs text-muted-foreground hover:text-foreground">
                                Avbryt
                              </button>
                            </span>
                          ) : (
                            <button onClick={() => setDeletingId(c.id)} className="text-muted-foreground/40 hover:text-destructive transition-colors text-xs px-1" title="Slett">
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visibleCount < sorted.length && (
                <div className="px-3 py-3 bg-muted/30 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Viser {visibleCount} av {sorted.length}</p>
                  <Button size="sm" variant="outline" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                    Vis {Math.min(PAGE_SIZE, sorted.length - visibleCount)} til
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Small helper components ───────────────────────────────────────────────────

function Chip({
  label,
  onRemove,
  accent,
}: {
  label: string;
  onRemove: () => void;
  accent?: "emerald" | "amber";
}) {
  const color =
    accent === "emerald"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:[&_button]:text-emerald-500"
      : accent === "amber"
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:[&_button]:text-amber-500"
      : "bg-primary/10 text-primary hover:[&_button]:text-primary/70";
  return (
    <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${color}`}>
      {label}
      <button type="button" onClick={onRemove}>
        <X className="size-3" />
      </button>
    </span>
  );
}

function BiggestProjectCard({ project }: { project: ProjectBucket }) {
  const sessionsLabel =
    project.sessionsToSend !== null && project.sessionsToSend > 0
      ? ` · sent in ${project.sessionsToSend + 1} sessions`
      : project.sends > 0 && project.sessionsToSend === 0
      ? " · flashed"
      : "";
  return (
    <Card size="sm" className="col-span-2">
      <CardHeader>
        <CardTitle className="text-xs font-normal text-muted-foreground">
          Biggest project
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-base font-semibold">{project.route}</span>
          {project.crag && (
            <span className="text-xs text-muted-foreground">{project.crag}</span>
          )}
          {project.topGrade && (
            <Badge variant="outline" className="text-xs">{project.topGrade}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {project.total} {project.total === 1 ? "attempt" : "attempts"}
          {project.sends > 0 && ` · ${project.sends} send${project.sends === 1 ? "" : "s"}`}
          {sessionsLabel}
        </p>
      </CardContent>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  sub,
  routeName,
  accent,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Optional route name shown between the big value and the sub line. */
  routeName?: string | null;
  accent?: "emerald" | "amber";
  /** If set, the card becomes clickable and shows a pointer cursor. */
  onClick?: () => void;
}) {
  const accentClass =
    accent === "emerald"
      ? "border-l-4 border-l-emerald-500"
      : accent === "amber"
      ? "border-l-4 border-l-amber-500"
      : undefined;
  const interactive = onClick
    ? "cursor-pointer hover:bg-muted/40 transition-colors"
    : undefined;
  return (
    <Card
      size="sm"
      className={[accentClass, interactive].filter(Boolean).join(" ") || undefined}
      onClick={onClick}
    >
      <CardHeader>
        <CardTitle className="text-xs font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <span className="text-2xl font-semibold">{value}</span>
        {routeName && (
          <p className="text-xs font-medium truncate mt-0.5" title={routeName}>
            {routeName}
          </p>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className={action ? "flex flex-row items-center justify-between space-y-0" : undefined}>
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
