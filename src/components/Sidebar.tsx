"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClientUserButton } from "@/components/ClientUserButton";
import {
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  Dna,
  Film,
  Images,
  LayoutGrid,
  UserSquare,
} from "lucide-react";
import type { Project } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { projectEditorHref } from "@/lib/social-content";
import { Button } from "@/components/ui/button";
import { AppSettingsDialog } from "@/components/AppSettingsDialog";
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "@/lib/layout-preferences";

function SidebarCreateLink({
  href,
  title,
  icon,
  active,
}: {
  href: string;
  title: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Button
      asChild
      variant="outline"
      size="icon-sm"
      className={cn(
        "h-7 w-7 rounded-md",
        active && "border-accent bg-accent text-accent-foreground hover:bg-accent/90",
      )}
    >
      <Link href={href} title={title}>
        {icon}
      </Link>
    </Button>
  );
}

function SidebarNavLink({
  href,
  title,
  label,
  icon,
  active,
  collapsed = false,
}: {
  href: string;
  title: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  collapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <Link
        href={href}
        title={title}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
          active
            ? "bg-accent text-accent-foreground"
            : "text-foreground/80 hover:bg-muted hover:text-foreground",
        )}
      >
        {icon}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      title={title}
      className={cn(
        "mx-1.5 mb-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-foreground/80 hover:bg-muted",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

export function Sidebar({
  projects,
  activeProjectId,
}: {
  projects: Project[];
  activeProjectId?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const videoCreateActive = pathname === "/projects/new";
  const socialCreateActive = pathname === "/publications/new";

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
      <div
        className={cn(
          "flex border-b border-border py-2.5",
          collapsed ? "flex-col items-center gap-1.5 px-1" : "items-center gap-2 px-3",
        )}
      >
        <Link
          href="/"
          title="Voltar para os projetos"
          className={cn(
            "flex min-w-0 items-center transition-colors hover:opacity-90",
            collapsed ? "justify-center" : "min-w-0 flex-1 gap-2",
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
        <div className={cn("flex shrink-0 items-center gap-1", collapsed && "flex-col")}>
          <SidebarCreateLink
            href="/projects/new"
            title="Novo vídeo — timeline com narração"
            active={videoCreateActive}
            icon={<Film className="h-3.5 w-3.5" />}
          />
          <SidebarCreateLink
            href="/publications/new"
            title="Publicação social — carrossel, feed e stories"
            active={socialCreateActive}
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
          />
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="px-3 pb-1 pt-3">
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              Projects
            </span>
          </div>

          <nav className="flex-1 overflow-auto px-1.5 pb-2 scrollbar-thin">
            {projects.length === 0 && (
              <div className="px-2.5 py-3 text-2xs text-muted-foreground">
                No projects yet. Create one to get started.
              </div>
            )}
            {projects.map((p) => {
              const href = projectEditorHref(p);
              const active =
                p.id === activeProjectId ||
                pathname === href ||
                pathname === `/projects/${p.id}` ||
                pathname === `/publications/${p.id}`;
              return (
                <Link
                  key={p.id}
                  href={href}
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

          <SidebarNavLink
            href="/gallery"
            title="Gallery"
            label="Gallery"
            active={pathname?.startsWith("/gallery")}
            icon={<Images className="h-3.5 w-3.5" />}
          />
          <SidebarNavLink
            href="/dna"
            title="Project DNA"
            label="Project DNA"
            active={pathname?.startsWith("/dna")}
            icon={<Dna className="h-3.5 w-3.5" />}
          />
          <SidebarNavLink
            href="/avatars"
            title="Avatars"
            label="Avatars"
            active={pathname?.startsWith("/avatars")}
            icon={<UserSquare className="h-3.5 w-3.5" />}
          />

          <div className="space-y-1 border-t border-border px-1.5 py-2">
            <AppSettingsDialog />
            <div className="flex items-center justify-between px-1.5">
              <ClientUserButton afterSignOutUrl="/sign-in" />
              <span className="text-2xs text-muted-foreground">v2</span>
            </div>
          </div>
        </>
      )}

      {collapsed && (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 py-3">
          <SidebarNavLink
            href="/gallery"
            title="Gallery"
            label="Gallery"
            collapsed
            active={pathname?.startsWith("/gallery")}
            icon={<Images className="h-4 w-4" />}
          />
          <SidebarNavLink
            href="/dna"
            title="Project DNA"
            label="Project DNA"
            collapsed
            active={pathname?.startsWith("/dna")}
            icon={<Dna className="h-4 w-4" />}
          />
          <SidebarNavLink
            href="/avatars"
            title="Avatars"
            label="Avatars"
            collapsed
            active={pathname?.startsWith("/avatars")}
            icon={<UserSquare className="h-4 w-4" />}
          />
          <div className="mt-auto flex w-full flex-col items-center gap-2 border-t border-border px-1 pt-2 pb-2">
            <AppSettingsDialog collapsed />
            <ClientUserButton afterSignOutUrl="/sign-in" />
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
