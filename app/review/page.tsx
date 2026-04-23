"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { Climb, NewClimb, PartialClimb } from "@/lib/types";
import { getUnreviewedClimbs, updateClimb, insertClimb } from "@/lib/db";
import { EntryForm } from "@/components/entry-form";
import { FileDrop } from "@/components/file-drop";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Upload, Database } from "lucide-react";

const STORAGE_KEY = "klatredagbok_upload_queue";

// ── Flag detection ────────────────────────────────────────────────────────────
interface Flag {
  type: "warning" | "error";
  message: string;
}

function detectFlags(climb: PartialClimb | undefined, allClimbs?: PartialClimb[]): Flag[] {
  if (!climb) return [];
  const flags: Flag[] = [];

  if (!climb.date) flags.push({ type: "error", message: "Mangler dato" });
  if (!climb.grade_no && !climb.grade_fr) flags.push({ type: "warning", message: "Mangler grad" });
  if (!climb.climb_type) flags.push({ type: "warning", message: "Mangler klatretype" });
  if (!climb.ascent_style) flags.push({ type: "warning", message: "Mangler bestigningsstil" });

  if (climb.length_m !== null && climb.length_m !== undefined && isNaN(Number(climb.length_m))) {
    flags.push({ type: "error", message: "Ugyldig lengde" });
  }

  if (allClimbs && climb.route_name && climb.date) {
    const duplicates = allClimbs.filter(
      (c) => c !== climb && c.route_name === climb.route_name && c.date === climb.date
    );
    if (duplicates.length > 0) {
      flags.push({ type: "warning", message: "Mulig duplikat (samme rute + dato)" });
    }
  }

  return flags;
}

// ── Persistent upload queue helpers ──────────────────────────────────────────
function saveQueueToStorage(queue: PartialClimb[], index: number) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, index }));
  } catch {}
}

function loadQueueFromStorage(): { queue: PartialClimb[]; index: number } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearQueueStorage() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Mode = "choose" | "db" | "upload";

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewPageInner />
    </Suspense>
  );
}

function ReviewPageInner() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(() =>
    searchParams.get("mode") === "upload" ? "upload" : "choose"
  );

  // ── DB review state ──────────────────────────────────────────────────────
  // Start with dbLoading=true so we never render current=undefined
  const [dbQueue, setDbQueue] = useState<Climb[]>([]);
  const [dbIndex, setDbIndex] = useState(0);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbDone, setDbDone] = useState(false);

  // ── Upload review state ──────────────────────────────────────────────────
  const [uploadQueue, setUploadQueue] = useState<PartialClimb[]>([]);
  const [uploadIndex, setUploadIndex] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [committedCount, setCommittedCount] = useState(0);
  const [resumable, setResumable] = useState(false);

  // Check for a saved queue on mount
  useEffect(() => {
    const saved = loadQueueFromStorage();
    if (saved && saved.queue.length > 0 && saved.index < saved.queue.length) {
      setResumable(true);
    }
  }, []);

  // ── Load DB queue when switching to DB mode ───────────────────────────────
  useEffect(() => {
    if (mode !== "db") return;
    setDbLoading(true);
    setDbDone(false);
    getUnreviewedClimbs()
      .then((data) => {
        setDbQueue(data);
        setDbIndex(0);
        setDbDone(data.length === 0);
      })
      .catch(() => {})
      .finally(() => setDbLoading(false));
  }, [mode]);

  // Persist upload queue whenever it changes
  useEffect(() => {
    if (uploadQueue.length > 0) {
      saveQueueToStorage(uploadQueue, uploadIndex);
    }
  }, [uploadQueue, uploadIndex]);

  // ── DB wizard handlers ────────────────────────────────────────────────────
  async function handleDbSave(data: NewClimb) {
    const current = dbQueue[dbIndex];
    if (!current) return;
    await updateClimb(current.id, { ...data, reviewed: true });
    if (dbIndex + 1 >= dbQueue.length) {
      setDbDone(true);
    } else {
      setDbIndex((i) => i + 1);
    }
  }

  // ── Upload wizard handlers ─────────────────────────────────────────────────
  function startUploadQueue(queue: PartialClimb[], startIndex = 0) {
    setUploadQueue(queue);
    setUploadIndex(startIndex);
    setCommittedCount(0);
    setUploadDone(false);
    setUploadError(null);
    setResumable(false);
  }

  function handleFileParsed(rows: PartialClimb[]) {
    clearQueueStorage();
    startUploadQueue(rows, 0);
  }

  function handleResumeUpload() {
    const saved = loadQueueFromStorage();
    if (!saved) return;
    setUploadQueue(saved.queue);
    setUploadIndex(saved.index);
    setCommittedCount(saved.index); // already committed entries = index
    setUploadDone(false);
    setUploadError(null);
    setResumable(false);
    setMode("upload");
  }

  // Commit each entry immediately to DB as user clicks Bekreft
  const handleUploadSave = useCallback(async (data: NewClimb) => {
    await insertClimb({ ...data, reviewed: true });
    const nextIndex = uploadIndex + 1;
    setCommittedCount((c) => c + 1);
    if (nextIndex >= uploadQueue.length) {
      setUploadDone(true);
      clearQueueStorage();
    } else {
      setUploadIndex(nextIndex);
    }
  }, [uploadIndex, uploadQueue.length]);

  // Skip current entry without saving
  function handleSkip() {
    const nextIndex = uploadIndex + 1;
    if (nextIndex >= uploadQueue.length) {
      setUploadDone(true);
      clearQueueStorage();
    } else {
      setUploadIndex(nextIndex);
    }
  }

  // ── Mode: choose ─────────────────────────────────────────────────────────
  if (mode === "choose") {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-6">Gjennomgå</h1>
        <div className="grid gap-4">
          <button
            onClick={() => setMode("db")}
            className="flex items-center gap-4 rounded-xl bg-card ring-1 ring-foreground/10 p-5 text-left hover:bg-card/80 transition-colors"
          >
            <Database className="size-6 text-primary shrink-0" />
            <div>
              <p className="font-medium">Gjennomgå ikke-gjennomgåtte</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Gå gjennom klatringer som ennå ikke er bekreftet
              </p>
            </div>
          </button>

          <button
            onClick={() => setMode("upload")}
            className="flex items-center gap-4 rounded-xl bg-card ring-1 ring-foreground/10 p-5 text-left hover:bg-card/80 transition-colors"
          >
            <Upload className="size-6 text-primary shrink-0" />
            <div>
              <p className="font-medium">Last opp Excel / CSV</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Importer og gjennomgå en eksisterende dagbok-fil
              </p>
            </div>
          </button>

          {resumable && (
            <button
              onClick={handleResumeUpload}
              className="flex items-center gap-4 rounded-xl bg-primary/10 ring-1 ring-primary/30 p-5 text-left hover:bg-primary/15 transition-colors"
            >
              <CheckCircle className="size-6 text-primary shrink-0" />
              <div>
                <p className="font-medium text-primary">Fortsett fra forrige økt</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Du har ubehandlede rader fra forrige opplasting
                </p>
              </div>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Mode: DB review ───────────────────────────────────────────────────────
  if (mode === "db") {
    if (dbLoading) {
      return (
        <div>
          <BackButton onClick={() => setMode("choose")} />
          <p className="text-muted-foreground text-sm mt-4">Laster…</p>
        </div>
      );
    }
    if (dbDone) {
      return (
        <div>
          <BackButton onClick={() => setMode("choose")} />
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle className="size-10 text-primary" />
            <p className="font-medium">Alle klatringer er gjennomgått!</p>
          </div>
        </div>
      );
    }

    const current = dbQueue[dbIndex];
    if (!current) return null;
    const flags = detectFlags(current);

    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <BackButton onClick={() => setMode("choose")} />
          <span className="text-sm text-muted-foreground">
            {dbIndex + 1} / {dbQueue.length}
          </span>
        </div>

        <p className="font-medium mb-3">{current.route_name ?? "Ukjent rute"}</p>
        <FlagStrip flags={flags} />

        {/* Top submit button */}
        <button
          form="review-form"
          type="submit"
          className="w-full mb-4 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Lagre &amp; neste
        </button>

        <EntryForm
          formId="review-form"
          key={current.id}
          initialData={current}
          onSubmit={handleDbSave}
          submitLabel="Lagre & neste"
        />
      </div>
    );
  }

  // ── Mode: upload review ───────────────────────────────────────────────────
  if (mode === "upload") {
    if (uploadQueue.length === 0) {
      return (
        <div>
          <BackButton onClick={() => setMode("choose")} />
          <div className="mt-4">
            <h2 className="font-semibold mb-4">Last opp fil</h2>
            <FileDrop
              onParsed={handleFileParsed}
              onError={(msg) => setUploadError(msg)}
            />
            {uploadError && (
              <p className="mt-3 text-sm text-destructive">{uploadError}</p>
            )}
          </div>
        </div>
      );
    }

    if (uploadDone) {
      return (
        <div>
          <BackButton onClick={() => setMode("choose")} />
          <div className="mt-6 flex flex-col items-center gap-4 text-center">
            <CheckCircle className="size-10 text-primary" />
            <p className="font-medium">{committedCount} klatringer lagret!</p>
            <Button onClick={() => setMode("choose")} className="w-full">
              Ferdig
            </Button>
          </div>
        </div>
      );
    }

    const current = uploadQueue[uploadIndex];
    if (!current) return null;
    const remaining = uploadQueue.length - uploadIndex;
    const flags = detectFlags(current, uploadQueue);

    return (
      <div>
        {/* Header row */}
        <div className="flex items-center justify-between mb-1">
          <BackButton onClick={() => setMode("choose")} />
          <span className="text-sm text-muted-foreground">
            {uploadIndex + 1} / {uploadQueue.length}
            {committedCount > 0 && (
              <span className="ml-2 text-primary">({committedCount} lagret)</span>
            )}
          </span>
        </div>

        <p className="font-medium mb-1">{current.route_name ?? "Ukjent rute"}</p>
        <p className="text-xs text-muted-foreground mb-3">
          {remaining} igjen — du kan gå tilbake og fortsette senere
        </p>

        <FlagStrip flags={flags} />

        {uploadError && (
          <p className="mb-3 text-sm text-destructive">{uploadError}</p>
        )}

        {/* Top submit button */}
        <button
          form="upload-form"
          type="submit"
          className="w-full mb-4 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Bekreft &amp; neste
        </button>

        <EntryForm
          formId="upload-form"
          key={uploadIndex}
          initialData={current}
          onSubmit={async (data) => {
            try {
              await handleUploadSave(data);
            } catch (err) {
              const msg = err instanceof Error ? err.message
                : typeof err === "object" && err !== null && "message" in err
                ? String((err as { message: unknown }).message)
                : JSON.stringify(err);
              setUploadError(msg || "Feil ved lagring");
            }
          }}
          submitLabel="Bekreft & neste"
        />

        {/* Skip button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSkip}
          className="w-full mt-2 text-muted-foreground"
        >
          Hopp over denne
        </Button>
      </div>
    );
  }

  return null;
}

// ── Small helper components ───────────────────────────────────────────────────

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="-ml-2">
      ← Tilbake
    </Button>
  );
}

function FlagStrip({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {flags.map((flag, i) => (
        <div
          key={i}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
            flag.type === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-amber-500/10 text-amber-500"
          }`}
        >
          <AlertTriangle className="size-3 shrink-0" />
          {flag.message}
        </div>
      ))}
    </div>
  );
}
