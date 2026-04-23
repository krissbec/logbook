"use client";

import { Trash2, Plus } from "lucide-react";
import type { Pitch } from "@/lib/types";
import { normalizeGrade, NO_GRADES, FR_GRADES } from "@/lib/grades";
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

interface PitchListProps {
  pitches: Pitch[];
  gradeSystem: "NO" | "FR";
  onChange: (pitches: Pitch[]) => void;
}

export function PitchList({ pitches, gradeSystem, onChange }: PitchListProps) {
  const grades = gradeSystem === "NO" ? NO_GRADES : FR_GRADES;

  function addPitch() {
    onChange([
      ...pitches,
      { pitch: pitches.length + 1, grade_no: null, grade_fr: null, length_m: null },
    ]);
  }

  function removePitch(index: number) {
    const updated = pitches
      .filter((_, i) => i !== index)
      .map((p, i) => ({ ...p, pitch: i + 1 }));
    onChange(updated);
  }

  function updatePitch(index: number, field: keyof Pitch, rawValue: string) {
    const updated = pitches.map((p, i) => {
      if (i !== index) return p;
      if (field === "grade_no" || field === "grade_fr") {
        const { grade_no, grade_fr } = normalizeGrade(rawValue, gradeSystem);
        return { ...p, grade_no, grade_fr };
      }
      if (field === "length_m") {
        return { ...p, length_m: rawValue ? parseFloat(rawValue) : null };
      }
      return p;
    });
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      <Label>Lengder</Label>

      {pitches.length === 0 && (
        <p className="text-sm text-muted-foreground">Ingen lengder lagt til ennå.</p>
      )}

      {pitches.map((pitch, i) => {
        const gradeValue =
          gradeSystem === "NO" ? pitch.grade_no ?? "" : pitch.grade_fr ?? "";
        const converted =
          gradeSystem === "NO" && pitch.grade_fr
            ? `FR: ${pitch.grade_fr}`
            : gradeSystem === "FR" && pitch.grade_no
            ? `NO: ${pitch.grade_no}`
            : null;

        return (
          <div key={i} className="flex items-start gap-2">
            {/* Pitch number */}
            <span className="mt-1.5 w-6 shrink-0 text-center text-sm text-muted-foreground font-medium">
              {pitch.pitch}
            </span>

            {/* Grade */}
            <div className="flex-1 space-y-0.5">
              <Select
                value={gradeValue}
                onValueChange={(v) => updatePitch(i, "grade_no", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Grad" />
                </SelectTrigger>
                <SelectContent>
                  {grades.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {converted && (
                <p className="text-xs text-muted-foreground pl-0.5">{converted}</p>
              )}
            </div>

            {/* Length */}
            <Input
              type="number"
              min={0}
              placeholder="m"
              className="w-20"
              value={pitch.length_m ?? ""}
              onChange={(e) => updatePitch(i, "length_m", e.target.value)}
            />

            {/* Remove */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removePitch(i)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addPitch}>
        <Plus className="size-4" />
        Legg til lengde
      </Button>

      {/* Auto-sum of lengths */}
      {pitches.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Total:{" "}
          {pitches.every((p) => p.length_m !== null)
            ? `${pitches.reduce((s, p) => s + (p.length_m ?? 0), 0)} m`
            : "—"}
        </p>
      )}
    </div>
  );
}
