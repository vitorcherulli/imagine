"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Clapperboard, Plus, UserSquare } from "lucide-react";
import type { Project } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Sidebar({
  projects,
  activeProjectId,
}: {
  projects: Project[];
  activeProjectId?: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Clapperboard className="h-4 w-4" />
        </div>
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Imagine
        </Link>
      </div>

      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Projects
        </span>
        <Link href="/projects/new">
          <Button variant="primary" size="icon-sm" className="rounded-md">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      <nav className="flex-1 overflow-auto px-1.5 pb-2 scrollbar-thin">
        {projects.length === 0 && (
          <div className="px-2.5 py-3 text-2xs text-muted-foreground">
            No projects yet. Create one to get started.
          </div>
        )}
        {projects.map((p) => {
          const active = p.id === activeProjectId || pathname === `/projects/${p.id}`;
          return (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className={cn(
                "block truncate rounded-md px-2.5 py-1.5 text-xs",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground/80 hover:bg-muted",
              )}
            >
              {p.title || "Untitled"}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/avatars"
        className={cn(
          "mx-1.5 mb-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs",
          pathname?.startsWith("/avatars")
            ? "bg-accent text-accent-foreground"
            : "text-foreground/80 hover:bg-muted",
        )}
      >
        <UserSquare className="h-3.5 w-3.5" />
        Avatars
      </Link>

      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <UserButton afterSignOutUrl="/sign-in" />
        <span className="text-2xs text-muted-foreground">v2</span>
      </div>
    </aside>
  );
}
