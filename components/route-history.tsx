"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Climb } from "@/lib/types";
import { RESULT_LABEL, formatDetailWithResult } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

interface RouteHistoryProps {
  routeName: string;
  history: Climb[];
  crag?: string;
}

export function RouteHistory({ history, crag }: RouteHistoryProps) {
  const [open, setOpen] = useState(false);

  // Show entries matching crag if we have a crag; fall back to all entries.
  // Sort ascending by date so the climber sees the progression
  // (working → working → send) left-to-right.
  const shown = useMemo(() => {
    const base = crag
      ? (history.filter((c) => c.crag === crag).length > 0
          ? history.filter((c) => c.crag === crag)
          : history)
      : history;
    return [...base].sort((a, b) => {
      const ad = a.date ?? "";
      const bd = b.date ?? "";
      return ad.localeCompare(bd);
    });
  }, [history, crag]);

  // Split counts and sessions-to-send
  const { sendCount, workingCount, sessionsToSend } = useMemo(() => {
    const sendRows = shown.filter((c) => c.ascent_result === "Send");
    const workingCount = shown.filter((c) => c.ascent_result === "Working").length;

    const firstSendDate = sendRows
      .map((c) => c.date)
      .filter((d): d is string => !!d)
      .sort()[0] ?? null;

    const sessionsBefore = firstSendDate
      ? new Set(
          shown
            .filter((c) => c.date && c.date < firstSendDate)
            .map((c) => c.date as string),
        ).size
      : null;

    return {
      sendCount: sendRows.length,
      workingCount,
      sessionsToSend: sessionsBefore !== null ? sessionsBefore + 1 : null,
    };
  }, [shown]);

  if (shown.length === 0) return null;

  const summary = [
    `${sendCount} send${sendCount === 1 ? "" : "s"}`,
    workingCount > 0 ? `${workingCount} attempt${workingCount === 1 ? "" : "s"}` : null,
    sessionsToSend !== null && sessionsToSend > 1 ? `sent in ${sessionsToSend} sessions` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Badge variant="secondary" className="text-xs">{summary}</Badge>
        {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 divide-y divide-border text-xs">
          {shown.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 flex-wrap">
              <span className="text-muted-foreground shrink-0">{fmtDate(c.date)}</span>
              {c.ascent_result && (
                <span
                  className={`inline-block size-2 rounded-full shrink-0 ${
                    c.ascent_result === "Send" ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                  aria-label={RESULT_LABEL[c.ascent_result]}
                />
              )}
              {c.grade_no && (
                <Badge variant="outline" className="text-xs">{c.grade_no}</Badge>
              )}
              {c.ascent_style && (
                <span className="text-foreground">{c.ascent_style}</span>
              )}
              {c.ascent_detail && (
                <span className="text-muted-foreground">
                  · {formatDetailWithResult(c.ascent_style, c.ascent_detail)}
                </span>
              )}
              {!crag && c.crag && (
                <span className="text-muted-foreground italic">{c.crag}</span>
              )}
              {c.notes && (
                <span className="text-muted-foreground italic truncate max-w-[120px]">
                  {c.notes}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
