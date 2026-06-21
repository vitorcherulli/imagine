"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  Dna,
  Plus,
  UserSquare,
} from "lucide-react";
import type { Project } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AppSettingsDialog } from "@/components/AppSettingsDialog";
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "@/lib/layout-preferences";

export function Sidebar({
  projects,
  activeProjectId,
}: {
  projects: Project[];
  activeProjectId?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(readSidebarCollapsed());
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r border-border bg-panel transition-[width] duration-200",
        collapsed ? "w-12" : "w-60",
      )}
    >
      <Link
        href="/"
        title="Voltar para os projetos"
        className={cn(
          "flex items-center border-b border-border py-2.5 transition-colors hover:bg-muted/40",
          collapsed ? "justify-center px-1" : "gap-2 px-3",
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Clapperboard className="h-4 w-4" />
        </span>
        {!collapsed && (
          <span className="min-w-0 truncate text-sm font-semibold tracking-tight">
            Imagine
          </span>
        )}
      </Link>

      {!collapsed && (
        <>
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
            href="/dna"
            className={cn(
              "mx-1.5 mb-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs",
              pathname?.startsWith("/dna")
                ? "bg-accent text-accent-foreground"
                : "text-foreground/80 hover:bg-muted",
            )}
          >
            <Dna className="h-3.5 w-3.5" />
            Project DNA
          </Link>

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

          <div className="space-y-1 border-t border-border px-1.5 py-2">
            <AppSettingsDialog />
            <div className="flex items-center justify-between px-1.5">
              <UserButton afterSignOutUrl="/sign-in" />
              <span className="text-2xs text-muted-foreground">v2</span>
            </div>
          </div>
        </>
      )}

      {collapsed && (
        <div className="flex flex-1 flex-col items-center gap-2 py-3">
          <Link
            href="/projects/new"
            title="New project"
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/80 hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
          </Link>
          <Link
            href="/dna"
            title="Project DNA"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              pathname?.startsWith("/dna")
                ? "bg-accent text-accent-foreground"
                : "text-foreground/80 hover:bg-muted",
            )}
          >
            <Dna className="h-4 w-4" />
          </Link>
          <Link
            href="/avatars"
            title="Avatars"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              pathname?.startsWith("/avatars")
                ? "bg-accent text-accent-foreground"
                : "text-foreground/80 hover:bg-muted",
            )}
          >
            <UserSquare className="h-4 w-4" />
          </Link>
          <div className="mt-auto flex flex-col items-center gap-2 pb-2">
            <AppSettingsDialog collapsed />
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "absolute -right-3 top-14 z-20 flex h-6 w-6 items-center justify-center rounded-full",
          "border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground",
        )}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>
    </aside>
  );
}
