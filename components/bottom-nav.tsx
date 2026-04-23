"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusCircle, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/input",     label: "Logg",     Icon: PlusCircle },
  { href: "/dashboard", label: "Oversikt", Icon: BarChart2 },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card">
      <div className="flex h-16 max-w-2xl mx-auto">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
