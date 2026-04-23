"use client";

import { NO_GRADES, FR_GRADES, normalizeGrade } from "@/lib/grades";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface GradeInputProps {
  system: "NO" | "FR";
  value: string;
  onSystemChange: (system: "NO" | "FR") => void;
  onValueChange: (value: string) => void;
  label?: string;
  className?: string;
}

export function GradeInput({
  system,
  value,
  onSystemChange,
  onValueChange,
  label = "Grad",
  className,
}: GradeInputProps) {
  const grades = system === "NO" ? NO_GRADES : FR_GRADES;
  const { grade_no, grade_fr } = value
    ? normalizeGrade(value, system)
    : { grade_no: null, grade_fr: null };

  const convertedLabel =
    system === "NO"
      ? grade_fr ? `FR: ${grade_fr}` : null
      : grade_no ? `NO: ${grade_no}` : null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>

      {/* System toggle */}
      <div className="flex rounded-lg border border-input overflow-hidden w-fit">
        {(["NO", "FR"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              onSystemChange(s);
              onValueChange(""); // reset grade when switching system
            }}
            className={cn(
              "px-3 py-1 text-sm transition-colors",
              system === s
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Grade selector */}
      <Select value={value} onValueChange={(v) => onValueChange(v ?? "")}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Velg grad" />
        </SelectTrigger>
        <SelectContent>
          {grades.map((g) => (
            <SelectItem key={g} value={g}>
              {g}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Live conversion hint */}
      {convertedLabel && (
        <p className="text-xs text-muted-foreground">{convertedLabel}</p>
      )}
    </div>
  );
}
