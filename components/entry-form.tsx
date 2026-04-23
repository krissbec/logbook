"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Climb, NewClimb, PartialClimb, AscentStyle, AscentDetail, ClimbType, Pitch } from "@/lib/types";
import { STYLE_DETAILS, deriveAscentResult, RESULT_LABEL } from "@/lib/types";
import { normalizeGrade } from "@/lib/grades";
import { getDistinctCrags, getDistinctRoutes, getDistinctPartners, getRouteHistory } from "@/lib/db";
import { GradeInput } from "@/components/grade-input";
import { PitchList } from "@/components/pitch-list";
import { RouteHistory } from "@/components/route-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CLIMB_TYPES: ClimbType[] = ["Trad", "Sport", "Mixed", "Bouldering", "Alpine", "Scrambling", "Winter"];
const ASCENT_STYLES: AscentStyle[] = ["Lead", "Solo", "DWS", "Boulder", "Alternate Leads", "Second", "Top-rope"];

// Small inline hint shown below a field when the imported value couldn't be mapped
function ImportHint({ value }: { value: string | undefined }) {
  if (!value) return null;
  return (
    <p className="text-xs text-amber-400/80 mt-1">
      Original verdi: <span className="font-medium">{value}</span>
    </p>
  );
}

interface EntryFormProps {
  initialData?: PartialClimb;
  onSubmit: (data: NewClimb) => Promise<void>;
  submitLabel?: string;
  /** If provided, the <form> gets this id so external buttons can submit it via form="id" */
  formId?: string;
}

export function EntryForm({ initialData, onSubmit, submitLabel = "Lagre", formId }: EntryFormProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const hints = initialData?._importHints ?? {};

  // If initialData is provided (review mode) but has no parsed date, default to "" not today
  const [date, setDate] = useState(
    initialData ? (initialData.date ?? "") : today
  );
  const [routeName, setRouteName] = useState(initialData?.route_name ?? "");
  const [crag, setCrag] = useState(initialData?.crag ?? "");
  const [climbType, setClimbType] = useState<ClimbType | "">(initialData?.climb_type ?? "");
  const [isMultipitch, setIsMultipitch] = useState(initialData?.is_multipitch ?? false);
  const [gradeSystem, setGradeSystem] = useState<"NO" | "FR">(initialData?.grade_system ?? "NO");
  const [gradeValue, setGradeValue] = useState(
    initialData?.grade_system === "FR"
      ? (initialData?.grade_fr ?? "")
      : (initialData?.grade_no ?? "")
  );
  const [pitches, setPitches] = useState<Pitch[]>(initialData?.pitches ?? []);
  const [lengthM, setLengthM] = useState(initialData?.length_m?.toString() ?? "");
  const [ascentStyle, setAscentStyle] = useState<AscentStyle | "">(initialData?.ascent_style ?? "");
  const [ascentDetail, setAscentDetail] = useState(initialData?.ascent_detail ?? "");
  const [weather, setWeather] = useState(initialData?.weather ?? "");
  const [partner, setPartner] = useState(initialData?.partner ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [attempts, setAttempts] = useState(initialData?.attempts?.toString() ?? "1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Autocomplete data ─────────────────────────────────────────────────────
  const [crags, setCrags] = useState<string[]>([]);
  const [routes, setRoutes] = useState<{ route_name: string; crag: string | null; count: number }[]>([]);
  const [partners, setPartners] = useState<string[]>([]);
  const [routeHistory, setRouteHistory] = useState<Climb[]>([]);

  useEffect(() => {
    getDistinctCrags().then(setCrags).catch(() => {});
    getDistinctRoutes().then(setRoutes).catch(() => {});
    getDistinctPartners().then(setPartners).catch(() => {});
  }, []);

  // Load route history whenever routeName changes
  const loadRouteHistory = useCallback((name: string) => {
    if (!name.trim()) { setRouteHistory([]); return; }
    getRouteHistory(name).then(setRouteHistory).catch(() => {});
  }, []);

  useEffect(() => { loadRouteHistory(routeName); }, [routeName, loadRouteHistory]);

  // When a route is selected from autocomplete, pre-fill crag
  function handleRouteNameChange(value: string) {
    setRouteName(value);
    const match = routes.find((r) => r.route_name === value);
    if (match?.crag && !crag) setCrag(match.crag);
  }

  // Autofill empty fields (crag, climb type, length, grade) from the most
  // recent previous entry when routeHistory loads for a new route. Ref guard
  // ensures each route is only autofilled once — so after the climber edits
  // a field, reloading history won't overwrite their change. Only empty
  // fields are touched.
  const autofilledRouteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (routeHistory.length === 0) return;
    const prev = routeHistory[0]; // getRouteHistory sorts by date DESC
    const key = `${prev.route_name ?? ""}|||${prev.crag ?? ""}`;
    if (autofilledRouteKeyRef.current === key) return;
    autofilledRouteKeyRef.current = key;

    if (!crag && prev.crag) setCrag(prev.crag);
    if (!climbType && prev.climb_type) setClimbType(prev.climb_type);
    if (!lengthM && prev.length_m !== null && prev.length_m !== undefined) {
      setLengthM(String(prev.length_m));
    }
    if (!gradeValue) {
      const sys = prev.grade_system ?? "NO";
      const g = sys === "FR" ? prev.grade_fr : prev.grade_no;
      if (g) {
        setGradeSystem(sys);
        setGradeValue(g);
      }
    }
  }, [routeHistory, crag, climbType, lengthM, gradeValue]);

  // Reset detail when style changes
  function handleStyleChange(style: AscentStyle | "") {
    setAscentStyle(style);
    setAscentDetail("");
  }

  const validDetails = ascentStyle ? STYLE_DETAILS[ascentStyle] : [];

  // Derived send/working result from the current style+detail combination.
  // Recomputed on every render so the read-only summary line stays in sync.
  const derivedResult = deriveAscentResult(
    (ascentStyle as AscentStyle) || null,
    (ascentDetail as AscentDetail) || null,
  );

  // ── Derived values ─────────────────────────────────────────────────────────
  // For multi-pitch, auto-sum lengths if all pitches have length_m
  const derivedLength = isMultipitch && pitches.every((p) => p.length_m !== null)
    ? pitches.reduce((s, p) => s + (p.length_m ?? 0), 0)
    : null;

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { grade_no, grade_fr } = gradeValue
        ? normalizeGrade(gradeValue, gradeSystem)
        : { grade_no: null, grade_fr: null };

      const data: NewClimb = {
        date: date || null,
        route_name: routeName || null,
        crag: crag || null,
        grade_system: gradeSystem,
        grade_no,
        grade_fr,
        is_multipitch: isMultipitch,
        pitches: isMultipitch ? pitches : null,
        length_m: derivedLength ?? (lengthM ? parseFloat(lengthM) : null),
        climb_type: (climbType as ClimbType) || null,
        ascent_style: (ascentStyle as AscentStyle) || null,
        ascent_detail: (ascentDetail as Climb["ascent_detail"]) || null,
        ascent_result: derivedResult,
        weather: weather || null,
        partner: partner || null,
        notes: notes || null,
        attempts: attempts ? parseInt(attempts, 10) : null,
        reviewed: true,
      };

      await onSubmit(data);
    } catch (err) {
      // Supabase throws PostgrestError objects (not Error instances); extract message from either
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err);
      setError(msg || "Ukjent feil");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-5">
      {/* Date */}
      <div className="space-y-1.5">
        <Label htmlFor="date">Dato</Label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <ImportHint value={hints.date} />
      </div>

      {/* Route name */}
      <div className="space-y-1.5">
        <Label htmlFor="route">Navn på rute</Label>
        <Input
          id="route"
          list="routes-list"
          value={routeName}
          onChange={(e) => handleRouteNameChange(e.target.value)}
          placeholder="f.eks. Sjuer'n"
          autoComplete="off"
        />
        <datalist id="routes-list">
          {routes.map((r) => (
            <option key={r.route_name} value={r.route_name}>
              {r.crag ? `${r.route_name} (${r.crag})` : r.route_name}
            </option>
          ))}
        </datalist>
        <RouteHistory routeName={routeName} history={routeHistory} crag={crag || undefined} />
      </div>

      {/* Crag */}
      <div className="space-y-1.5">
        <Label htmlFor="crag">Klatrefelt / Fjell</Label>
        <Input
          id="crag"
          list="crags-list"
          value={crag}
          onChange={(e) => setCrag(e.target.value)}
          placeholder="f.eks. Skådalen"
          autoComplete="off"
        />
        <datalist id="crags-list">
          {crags.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {/* Climb type */}
      <div className="space-y-1.5">
        <Label>Type klatring</Label>
        <Select value={climbType} onValueChange={(v) => { if (v) setClimbType(v as ClimbType); }}>
          <SelectTrigger>
            <SelectValue placeholder="Velg type" />
          </SelectTrigger>
          <SelectContent>
            {CLIMB_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ImportHint value={hints.climb_type} />
      </div>

      {/* Single / Multi-pitch toggle */}
      <div className="space-y-1.5">
        <Label>Lengde</Label>
        <div className="flex rounded-lg border border-input overflow-hidden w-fit">
          {[false, true].map((mp) => (
            <button
              key={String(mp)}
              type="button"
              onClick={() => setIsMultipitch(mp)}
              className={`px-3 py-1 text-sm transition-colors ${
                isMultipitch === mp
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mp ? "Flerlengde" : "Enkeltlengde"}
            </button>
          ))}
        </div>
      </div>

      {/* Grade (overall) */}
      <GradeInput
        label={isMultipitch ? "Rutegrad (samlet)" : "Rutegrad"}
        system={gradeSystem}
        value={gradeValue}
        onSystemChange={setGradeSystem}
        onValueChange={(v) => setGradeValue(v ?? "")}
      />
      <ImportHint value={hints.grade} />

      {/* Single pitch: length field */}
      {!isMultipitch && (
        <div className="space-y-1.5">
          <Label htmlFor="length">Lengde (m)</Label>
          <Input
            id="length"
            type="number"
            min={0}
            value={lengthM}
            onChange={(e) => setLengthM(e.target.value)}
            placeholder="15"
          />
        </div>
      )}

      {/* Multi-pitch: pitch list */}
      {isMultipitch && (
        <PitchList
          pitches={pitches}
          gradeSystem={gradeSystem}
          onChange={setPitches}
        />
      )}

      {/* Ascent style */}
      <div className="space-y-1.5">
        <Label>Bestigningsstil</Label>
        <Select value={ascentStyle} onValueChange={(v) => { if (v) handleStyleChange(v as AscentStyle); }}>
          <SelectTrigger>
            <SelectValue placeholder="Velg stil" />
          </SelectTrigger>
          <SelectContent>
            {ASCENT_STYLES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ImportHint value={hints.ascent_style} />
      </div>

      {/* Ascent detail — only shown when style is selected and has valid details */}
      {ascentStyle && validDetails.length > 0 && (
        <div className="space-y-1.5">
          <Label>Detalj</Label>
          <Select value={ascentDetail} onValueChange={(v) => setAscentDetail(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Velg detalj (valgfritt)" />
            </SelectTrigger>
            <SelectContent>
              {validDetails.map((d) => {
                const r = deriveAscentResult(ascentStyle as AscentStyle, d);
                return (
                  <SelectItem key={d} value={d}>
                    <span>{d}</span>
                    {r && (
                      <span className={r === "Send" ? "text-emerald-500 ml-1" : "text-amber-500 ml-1"}>
                        ({RESULT_LABEL[r]})
                      </span>
                    )}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {derivedResult && (
            <p className={`text-xs ${derivedResult === "Send" ? "text-emerald-500" : "text-amber-500"}`}>
              Result: {RESULT_LABEL[derivedResult]}
            </p>
          )}
        </div>
      )}

      {/* Weather */}
      <div className="space-y-1.5">
        <Label htmlFor="weather">Værforhold</Label>
        <Input
          id="weather"
          value={weather}
          onChange={(e) => setWeather(e.target.value)}
          placeholder="f.eks. Sol og varmt"
        />
      </div>

      {/* Partner */}
      <div className="space-y-1.5">
        <Label htmlFor="partner">Klatrepartner</Label>
        <Input
          id="partner"
          list="partners-list"
          value={partner}
          onChange={(e) => setPartner(e.target.value)}
          placeholder="f.eks. Trond Moe"
          autoComplete="off"
        />
        <datalist id="partners-list">
          {partners.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>

      {/* Attempts */}
      <div className="space-y-1.5">
        <Label htmlFor="attempts">Forsøk</Label>
        <Input
          id="attempts"
          type="number"
          min={1}
          value={attempts}
          onChange={(e) => setAttempts(e.target.value)}
          placeholder="1"
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Merknader</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Valgfrie notater…"
          rows={3}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Submit */}
      <Button type="submit" className="w-full" size="lg" disabled={saving}>
        {saving ? "Lagrer…" : submitLabel}
      </Button>
    </form>
  );
}
