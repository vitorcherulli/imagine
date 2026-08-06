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
  FolderOpen,
  Images,
  Languages,
  LayoutGrid,
  Mountain,
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
import { useClientMounted } from "@/hooks/use-client-mounted";

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
}: {
  projects: Project[];
  activeProjectId?: string;
}) {
  const pathname = usePathname();
  const mounted = useClientMounted();
  const [collapsed, setCollapsed] = React.useState(false);
  const showCollapsed = mounted && collapsed;
  const videoCreateActive = pathname === "/projects/new";
  const socialCreateActive = pathname === "/publications/new";
  const dubbingCreateActive = pathname === "/dubs/new";
  const projectsActive = pathname === "/";
  const projectCount = projects.length;

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
        showCollapsed ? "w-12" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex border-b border-border py-2.5",
          showCollapsed ? "flex-col items-center gap-1.5 px-1" : "items-center gap-2 px-3",
        )}
      >
        <Link
          href="/"
          title="Voltar para os projetos"
          className={cn(
            "flex min-w-0 items-center transition-colors hover:opacity-90",
            showCollapsed ? "justify-center" : "min-w-0 flex-1 gap-2",
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Clapperboard className="h-4 w-4" />
          </span>
          {!showCollapsed && (
            <span className="min-w-0 truncate text-sm font-semibold tracking-tight">
              Imagine
            </span>
          )}
        </Link>
        <div className={cn("flex shrink-0 items-center gap-1", showCollapsed && "flex-col")}>
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
          <SidebarCreateLink
            href="/dubs/new"
            title="Nova dublagem — transcrever, traduzir e re-vozear MP4/MP3"
            active={dubbingCreateActive}
            icon={<Languages className="h-3.5 w-3.5" />}
          />
        </div>
      </div>

      {!showCollapsed && (
        <>
          <nav className="flex-1 overflow-auto pt-3 pb-2 scrollbar-thin">
            <Link
              href="/"
              title="Projects"
              className={cn(
                "mx-1.5 mb-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                projectsActive
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground/80 hover:bg-muted",
              )}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="flex-1">Projects</span>
              {projectCount > 0 ? (
                <span
                  className={cn(
                    "shrink-0 rounded px-1 text-[10px] tabular-nums",
                    projectsActive
                      ? "bg-accent-foreground/20 text-accent-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {projectCount}
                </span>
              ) : null}
            </Link>
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
            <SidebarNavLink
              href="/scenarios"
              title="Scenarios"
              label="Scenarios"
              active={pathname?.startsWith("/scenarios")}
              icon={<Mountain className="h-3.5 w-3.5" />}
            />
          </nav>

          <div className="space-y-1 border-t border-border px-1.5 py-2">
            <AppSettingsDialog />
            <div className="flex items-center justify-between px-1.5">
              <ClientUserButton afterSignOutUrl="/sign-in" />
              <span className="text-2xs text-muted-foreground">v2</span>
            </div>
          </div>
        </>
      )}

      {showCollapsed && (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 py-3">
          <SidebarNavLink
            href="/"
            title="Projects"
            label="Projects"
            collapsed
            active={projectsActive}
            icon={<FolderOpen className="h-4 w-4" />}
          />
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
          <SidebarNavLink
            href="/scenarios"
            title="Scenarios"
            label="Scenarios"
            collapsed
            active={pathname?.startsWith("/scenarios")}
            icon={<Mountain className="h-4 w-4" />}
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
