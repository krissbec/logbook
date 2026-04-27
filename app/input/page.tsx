"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NewClimb, PartialClimb } from "@/lib/types";
import { insertClimb } from "@/lib/db";
import { EntryForm } from "@/components/entry-form";
import { Button } from "@/components/ui/button";
import { CheckCircle, Upload } from "lucide-react";

export default function InputPage() {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [key, setKey] = useState(0);
  const [prefillData, setPrefillData] = useState<PartialClimb | undefined>(undefined);

  async function handleSubmit(data: NewClimb) {
    await insertClimb(data);
    setPrefillData({
      ...data,
      route_name: null,
      pitches: data.pitches?.map((pitch) => ({ ...pitch })) ?? null,
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setKey((k: number) => k + 1);
    }, 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Logg en klatring</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/review?mode=upload")}
          className="gap-1.5"
        >
          <Upload className="size-3.5" />
          Last opp Excel
        </Button>
      </div>

      {saved && (
        <div className="flex items-center gap-2 mb-4 rounded-lg bg-primary/10 text-primary px-4 py-3 text-sm">
          <CheckCircle className="size-4 shrink-0" />
          Klatringen er lagret!
        </div>
      )}

      <EntryForm
        key={key}
        initialData={prefillData}
        onSubmit={handleSubmit}
        submitLabel="Logg klatring"
      />
    </div>
  );
}
