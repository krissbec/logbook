"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { parseExcelFile } from "@/lib/excel";
import type { PartialClimb } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FileDropProps {
  onParsed: (rows: PartialClimb[]) => void;
  onError: (message: string) => void;
}

export function FileDrop({ onParsed, onError }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  async function processFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      onError("Kun .xlsx, .xls og .csv er støttet.");
      return;
    }
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const rows = parseExcelFile(buffer);
      if (rows.length === 0) {
        onError("Fant ingen rader i filen.");
      } else {
        onParsed(rows);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message
        : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "Kunne ikke lese filen.";
      onError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // reset input so same file can be re-selected
    e.target.value = "";
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <Upload className="size-8 text-muted-foreground" />
      <div>
        <p className="font-medium text-sm">
          {loading ? "Leser fil…" : "Slipp Excel-fil her, eller klikk for å velge"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
