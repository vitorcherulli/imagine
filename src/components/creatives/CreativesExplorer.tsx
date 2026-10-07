"use client";

import * as React from "react";
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronRight,
  CircleDashed,
  Copy,
  Download,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  LayoutGrid,
  Link2,
  List,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Trophy,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CREATIVE_TRASH_DAYS,
  CREATIVE_USAGES,
  creativeCode,
  isCreativeUsage,
  periodLabel,
  type CreativeUsage,
  type PerformanceTrend,
} from "@/lib/creatives";
import {
  StatusBadge,
  TrendBadge,
  adNameOf,
  conceptGaps,
  fmtChange,
  fmtMoney,
  fmtPct,
  type Concept,
  type CreativeLibrary,
} from "@/components/creatives/shared";
import {
  CONCEPT_DRAG_TYPE,
  FileThumb,
  StatusSelect,
  USAGE_DOT,
  UsageSelect,
  coverOf,
  type ConceptStatus,
  type FileActions,
} from "@/components/creatives/parts";
import type { ShareTarget } from "@/components/creatives/ShareDialog";

export type SmartId = "winners" | "feed" | "story" | "untested" | "archived";
export type Loc =
  | { kind: "root" }
  | { kind: "folder"; folder: string }
  | { kind: "concept"; code: number }
  | { kind: "smart"; id: SmartId }
  | { kind: "usage"; usage: CreativeUsage }
  | { kind: "trash" };
export type LibraryView = "grid" | "list";

const SMART: Record<SmartId, { label: string; icon: React.ElementType; empty: string }> = {
  winners: { label: "Winners", icon: Trophy, empty: "No winners yet — import results in Performance." },
  feed: { label: "Needs 4:5 feed", icon: AlertTriangle, empty: "Every concept has a feed size." },
  story: { label: "Needs 9:16 story", icon: AlertTriangle, empty: "Every concept has a story size." },
  untested: {
    label: "Not live yet",
    icon: CircleDashed,
    empty: "Every active concept has results in the last import.",
  },
  archived: { label: "Archived", icon: Archive, empty: "Nothing archived." },
};

const USAGE_ORDER: CreativeUsage[] = ["published", "used", "unused", "old"];

export function locFromParams(sp: URLSearchParams): Loc {
  const code = Number(sp.get("c"));
  if (Number.isInteger(code) && code > 0) return { kind: "concept", code };
  const smart = sp.get("v");
  if (smart && smart in SMART) return { kind: "smart", id: smart as SmartId };
  const usage = sp.get("u");
  if (isCreativeUsage(usage)) return { kind: "usage", usage };
  if (sp.has("trash")) return { kind: "trash" };
  const folder = sp.get("f");
  if (folder) return { kind: "folder", folder };
  return { kind: "root" };
}

export function locToSearch(loc: Loc): string {
  if (loc.kind === "concept") return `?c=${loc.code}`;
  if (loc.kind === "smart") return `?v=${loc.id}`;
  if (loc.kind === "usage") return `?u=${loc.usage}`;
  if (loc.kind === "trash") return "?trash";
  if (loc.kind === "folder") return `?f=${encodeURIComponent(loc.folder)}`;
  return "";
}

export type ConceptActions = {
  onStatus: (c: Concept, value: string) => void;
  onUsage: (c: Concept, value: CreativeUsage) => void;
  onTrash: (c: Concept) => void;
  onRestore: (c: Concept) => void;
  onDeleteForever: (c: Concept) => void;
  onEmptyTrash: () => void;
  onEdit: (c: Concept) => void;
  onNewVersion: (c: Concept) => void;
};

export type FolderActions = {
  create: (name: string) => Promise<string | null>;
  rename: (from: string, to: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
  move: (code: number, folder: string) => Promise<void>;
};

type Props = {
  library: CreativeLibrary;
  concepts: Concept[];
  trash: Concept[];
  statusOf: (c: Concept) => ConceptStatus;
  trendOf: (c: Concept) => PerformanceTrend | null;
  hasMetrics: boolean;
  loc: Loc;
  navigate: (loc: Loc) => void;
  query: string;
  view: LibraryView;
  onViewChange: (v: LibraryView) => void;
  fileActions: FileActions;
  conceptActions: ConceptActions;
  folderActions: FolderActions;
  onNewConcept: (folder: string | null) => void;
  onImport: (folder: string | null) => void;
  onOpenPerformance: () => void;
  onShare: (target: ShareTarget) => void;
};

function useConceptDrop(onDrop: (code: number) => void) {
  const [over, setOver] = React.useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(CONCEPT_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        const code = Number(e.dataTransfer.getData(CONCEPT_DRAG_TYPE));
        setOver(false);
        if (!code) return;
        e.preventDefault();
        onDrop(code);
      },
    },
  };
}

export function CreativesExplorer(props: Props) {
  const { library, concepts, statusOf, loc, navigate, query } = props;

  const isArchived = (c: Concept) => statusOf(c).status === "archived";
  const active = concepts.filter((c) => !isArchived(c));
  const byFolder = new Map<string, Concept[]>();
  for (const f of library.folders) byFolder.set(f, []);
  for (const c of active) byFolder.set(c.product, [...(byFolder.get(c.product) ?? []), c]);
  const folders = [...byFolder.keys()].sort();

  const smartList = (id: SmartId): Concept[] =>
    id === "archived"
      ? concepts.filter(isArchived)
      : id === "winners"
        ? active.filter((c) => statusOf(c).status === "winner")
        : id === "untested"
          ? active.filter((c) => !library.performance[c.code])
          : active.filter((c) => conceptGaps(c)[id]);
  const smartIds = (Object.keys(SMART) as SmartId[]).filter((id) => id !== "untested" || props.hasMetrics);
  const usageList = (u: CreativeUsage): Concept[] => concepts.filter((c) => c.usage === u);

  const concept =
    loc.kind === "concept"
      ? concepts.find((c) => c.code === loc.code) ?? props.trash.find((c) => c.code === loc.code)
      : undefined;
  const currentFolder = loc.kind === "folder" ? loc.folder : concept?.product ?? null;

  const q = query.trim().toLowerCase();
  const results = q
    ? concepts.filter((c) =>
        [creativeCode(c.code), c.product, c.angle, c.hook, c.creator, c.notes, ...c.files.map((f) => f.originalName)]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : null;

  return (
    <div className="grid gap-4 md:grid-cols-[210px_minmax(0,1fr)]">
      <FolderTree
        folders={folders}
        byFolder={byFolder}
        loc={loc}
        currentFolder={currentFolder}
        navigate={navigate}
        smartCounts={Object.fromEntries(smartIds.map((id) => [id, smartList(id).length]))}
        usageCounts={Object.fromEntries(USAGE_ORDER.map((u) => [u, usageList(u).length]))}
        trashCount={props.trash.length}
        folderActions={props.folderActions}
      />

      <div className="min-w-0 space-y-3">
        {results ? (
          <>
            <Breadcrumb items={[{ label: "Creatives", onClick: () => navigate({ kind: "root" }) }, { label: `Search “${query.trim()}”` }]} />
            <ConceptCollection {...props} list={results} showFolder empty="Nothing matches this search." />
          </>
        ) : loc.kind === "root" ? (
          <RootView {...props} folders={folders} byFolder={byFolder} active={active} />
        ) : loc.kind === "folder" ? (
          <FolderView {...props} folder={loc.folder} list={byFolder.get(loc.folder) ?? []} />
        ) : loc.kind === "smart" ? (
          <>
            <Breadcrumb
              items={[{ label: "Creatives", onClick: () => navigate({ kind: "root" }) }, { label: SMART[loc.id].label }]}
            />
            <ConceptCollection {...props} list={smartList(loc.id)} showFolder empty={SMART[loc.id].empty} />
          </>
        ) : loc.kind === "usage" ? (
          <>
            <Breadcrumb
              items={[
                { label: "Creatives", onClick: () => navigate({ kind: "root" }) },
                { label: CREATIVE_USAGES[loc.usage] },
              ]}
            />
            <ConceptCollection
              {...props}
              list={usageList(loc.usage)}
              showFolder
              empty={`Nothing marked as “${CREATIVE_USAGES[loc.usage]}”.`}
            />
          </>
        ) : loc.kind === "trash" ? (
          <TrashView {...props} />
        ) : concept ? (
          <ConceptDetail {...props} concept={concept} />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            This concept no longer exists.{" "}
            <button type="button" className="text-accent underline" onClick={() => navigate({ kind: "root" })}>
              Back to folders
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree

function FolderTree({
  folders,
  byFolder,
  loc,
  currentFolder,
  navigate,
  smartCounts,
  usageCounts,
  trashCount,
  folderActions,
}: {
  folders: string[];
  byFolder: Map<string, Concept[]>;
  loc: Loc;
  currentFolder: string | null;
  navigate: (loc: Loc) => void;
  smartCounts: Record<string, number>;
  usageCounts: Record<string, number>;
  trashCount: number;
  folderActions: FolderActions;
}) {
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");

  async function create() {
    const name = await folderActions.create(newName);
    setCreating(false);
    setNewName("");
    if (name) navigate({ kind: "folder", folder: name });
  }

  return (
    <aside className="space-y-3 md:sticky md:top-3 md:self-start">
      <nav className="space-y-0.5">
        <TreeRow
          icon={<Home className="h-3.5 w-3.5" />}
          label="All folders"
          active={loc.kind === "root"}
          onClick={() => navigate({ kind: "root" })}
        />
        {folders.map((f) => (
          <FolderTreeItem
            key={f}
            folder={f}
            concepts={byFolder.get(f) ?? []}
            loc={loc}
            expanded={currentFolder === f}
            navigate={navigate}
            folderActions={folderActions}
          />
        ))}
        {creating ? (
          <form
            className="flex items-center gap-1 px-1 py-0.5"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
              placeholder="e.g. Extrator"
              className="h-7 text-xs"
            />
            <Button type="submit" size="icon-sm" variant="ghost" title="Create">
              <Check className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <FolderPlus className="h-3.5 w-3.5" /> New folder
          </button>
        )}
      </nav>

      <nav className="space-y-0.5 border-t border-border pt-2">
        <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Views</p>
        {(Object.keys(smartCounts) as SmartId[]).map((id) => {
          const Icon = SMART[id].icon;
          const n = smartCounts[id] ?? 0;
          return (
            <TreeRow
              key={id}
              icon={
                <Icon
                  className={cn(
                    "h-3.5 w-3.5",
                    id === "winners" && n && "text-success",
                    (id === "feed" || id === "story") && n && "text-warning",
                  )}
                />
              }
              label={SMART[id].label}
              count={n}
              active={loc.kind === "smart" && loc.id === id}
              onClick={() => navigate({ kind: "smart", id })}
            />
          );
        })}
      </nav>

      <nav className="space-y-0.5 border-t border-border pt-2">
        <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Usage</p>
        {USAGE_ORDER.map((u) => (
          <TreeRow
            key={u}
            icon={
              <span className="flex h-3.5 w-3.5 items-center justify-center">
                <span className={cn("h-2 w-2 rounded-full", USAGE_DOT[u])} />
              </span>
            }
            label={CREATIVE_USAGES[u]}
            count={usageCounts[u] ?? 0}
            active={loc.kind === "usage" && loc.usage === u}
            onClick={() => navigate({ kind: "usage", usage: u })}
          />
        ))}
      </nav>

      <nav className="border-t border-border pt-2">
        <TreeRow
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Trash"
          count={trashCount}
          active={loc.kind === "trash"}
          onClick={() => navigate({ kind: "trash" })}
        />
      </nav>
    </aside>
  );
}

function TreeRow({
  icon,
  label,
  count,
  active,
  onClick,
  className,
  children,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  count?: number;
  active?: boolean;
  onClick: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group flex items-center rounded-md text-xs",
        active ? "bg-accent/10 text-accent" : "hover:bg-muted",
        className,
      )}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
        {count !== undefined ? <span className="ml-auto pl-1 text-2xs text-muted-foreground">{count}</span> : null}
      </button>
      {children}
    </div>
  );
}

function FolderTreeItem({
  folder,
  concepts,
  loc,
  expanded,
  navigate,
  folderActions,
}: {
  folder: string;
  concepts: Concept[];
  loc: Loc;
  expanded: boolean;
  navigate: (loc: Loc) => void;
  folderActions: FolderActions;
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(folder);
  const drop = useConceptDrop((code) => void folderActions.move(code, folder));

  if (editing) {
    return (
      <form
        className="flex items-center gap-1 px-1 py-0.5"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          if (name.trim() && name !== folder) void folderActions.rename(folder, name);
        }}
      >
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          className="h-7 text-xs"
        />
        <Button type="submit" size="icon-sm" variant="ghost" title="Rename">
          <Check className="h-3.5 w-3.5" />
        </Button>
      </form>
    );
  }

  return (
    <div {...drop.props} className={cn("rounded-md", drop.over && "ring-2 ring-accent")}>
      <TreeRow
        icon={expanded ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
        label={folder}
        count={concepts.length}
        active={loc.kind === "folder" && loc.folder === folder}
        onClick={() => navigate({ kind: "folder", folder })}
      >
        <span className="hidden shrink-0 pr-1 group-hover:flex">
          <button
            type="button"
            title="Rename folder"
            onClick={() => {
              setName(folder);
              setEditing(true);
            }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {concepts.length === 0 ? (
            <button
              type="button"
              title="Delete empty folder"
              onClick={() => void folderActions.remove(folder)}
              className="rounded p-0.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      </TreeRow>
      {expanded && concepts.length ? (
        <div className="ml-3 border-l border-border pl-1">
          {concepts.map((c) => (
            <TreeRow
              key={c.code}
              className="text-2xs"
              icon={<span className="font-mono text-[10px] text-muted-foreground">{creativeCode(c.code)}</span>}
              label={c.angle}
              active={loc.kind === "concept" && loc.code === c.code}
              onClick={() => navigate({ kind: "concept", code: c.code })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Views

function Breadcrumb({ items, actions }: { items: { label: string; onClick?: () => void }[]; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1 text-sm">
        {items.map((it, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
            {it.onClick ? (
              <button
                type="button"
                onClick={it.onClick}
                className="truncate text-muted-foreground hover:text-foreground hover:underline"
              >
                {it.label}
              </button>
            ) : (
              <span className="truncate font-semibold">{it.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: LibraryView; onChange: (v: LibraryView) => void }) {
  return (
    <div className="flex rounded-md bg-muted p-0.5">
      {(
        [
          ["grid", LayoutGrid, "Grid"],
          ["list", List, "List"],
        ] as const
      ).map(([v, Icon, label]) => (
        <button
          key={v}
          type="button"
          title={label}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-sm p-1.5",
            view === v ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

function RootView(
  props: Props & { folders: string[]; byFolder: Map<string, Concept[]>; active: Concept[] },
) {
  const { folders, byFolder, active, library, statusOf, hasMetrics, navigate, folderActions } = props;
  const missingFeed = active.filter((c) => conceptGaps(c).feed).length;
  const missingStory = active.filter((c) => conceptGaps(c).story).length;
  const withResults = active.filter((c) => library.performance[c.code]).length;
  const winners = active.filter((c) => statusOf(c).status === "winner").length;

  return (
    <>
      <Breadcrumb
        items={[{ label: "Creatives" }]}
        actions={
          <>
            {active.length ? (
              <Button size="sm" onClick={() => props.onShare({ scope: "all", value: "", label: "the whole library" })}>
                <Link2 className="h-3.5 w-3.5" /> Share
              </Button>
            ) : null}
            <Button size="sm" onClick={() => props.onImport(null)}>
              <Upload className="h-3.5 w-3.5" /> Import files
            </Button>
            <Button size="sm" variant="primary" onClick={() => props.onNewConcept(null)}>
              <Plus className="h-3.5 w-3.5" /> New concept
            </Button>
          </>
        }
      />
      {active.length ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <SummaryTile label="Active concepts" value={active.length} hint={`${library.creatives.length} files in ${folders.length} folders`} />
          <SummaryTile
            label="Needs 4:5 feed"
            value={missingFeed}
            hint={missingFeed ? "Meta crops them in the feed" : "All covered"}
            tone={missingFeed ? "warning" : "success"}
            onClick={missingFeed ? () => navigate({ kind: "smart", id: "feed" }) : undefined}
          />
          <SummaryTile
            label="Needs 9:16 story"
            value={missingStory}
            hint={missingStory ? "Stories and Reels get letterboxed" : "All covered"}
            tone={missingStory ? "warning" : "success"}
            onClick={missingStory ? () => navigate({ kind: "smart", id: "story" }) : undefined}
          />
          {hasMetrics ? (
            <SummaryTile
              label="With results"
              value={withResults}
              hint={winners ? `${winners} winner${winners > 1 ? "s" : ""}` : "No winner yet"}
              onClick={() => (winners ? navigate({ kind: "smart", id: "winners" }) : props.onOpenPerformance())}
            />
          ) : (
            <SummaryTile label="Results" value="—" hint="Import the Meta Ads CSV" onClick={props.onOpenPerformance} />
          )}
        </div>
      ) : null}

      {active.length ? <NextSteps {...props} /> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {folders.map((f) => (
          <FolderTile
            key={f}
            name={f}
            concepts={byFolder.get(f) ?? []}
            onOpen={() => navigate({ kind: "folder", folder: f })}
            onDropConcept={(code) => void folderActions.move(code, f)}
          />
        ))}
        <NewFolderTile onCreate={async (name) => {
          const created = await folderActions.create(name);
          if (created) navigate({ kind: "folder", folder: created });
        }} />
      </div>
      {folders.length ? (
        <p className="text-2xs text-muted-foreground">
          Folders are products — the folder name goes into every file name. Drag a concept onto a folder to move it.
        </p>
      ) : null}
    </>
  );
}

const STALE_DAYS = 7;
const NEXT_STEPS_SHOWN = 6;

type Step = {
  key: string;
  tone: "warning" | "success" | "muted";
  concept?: Concept;
  text: string;
  actions: { label: string; onClick: () => void }[];
};

/** What to do now, in priority order: fresh data first, then scale winners, then cut losers. */
function NextSteps(props: Props & { active: Concept[] }) {
  const { active, library, statusOf, hasMetrics, navigate, fileActions, conceptActions } = props;
  const [showAll, setShowAll] = React.useState(false);
  const steps: Step[] = [];

  if (!hasMetrics) {
    steps.push({
      key: "metrics",
      tone: "muted",
      text: "Import the Meta Ads CSV to see which concepts work — statuses and next steps follow from it.",
      actions: [{ label: "Import results", onClick: props.onOpenPerformance }],
    });
  } else if (library.periods[0]) {
    const newest = library.periods[0];
    const days = Math.floor(
      (Date.now() - new Date(newest.periodEnd ? `${newest.periodEnd}T23:59:59` : newest.importedAt).getTime()) /
        86_400_000,
    );
    if (days >= STALE_DAYS) {
      steps.push({
        key: "stale",
        tone: "warning",
        text: `The latest results end ${days} days ago — import the last period before deciding what to scale or pause.`,
        actions: [{ label: "Import fresh", onClick: props.onOpenPerformance }],
      });
    }
  }

  const fatigued = active
    .filter((c) => props.trendOf(c)?.fatigue && statusOf(c).status !== "pause")
    .sort((a, b) => (library.performance[b.code]?.spend ?? 0) - (library.performance[a.code]?.spend ?? 0));
  for (const c of fatigued) {
    const t = props.trendOf(c)!;
    const latest = c.versions[0]?.files[0];
    steps.push({
      key: `fatigue-${c.code}`,
      tone: "warning",
      concept: c,
      text:
        t.cpaChange != null && t.cpaChange > 0
          ? `is wearing out — cost per result ${fmtChange(t.cpaChange)} vs the previous period. Refresh it with a new version.`
          : t.ctrChange != null && t.ctrChange < 0
            ? `is wearing out — CTR ${fmtChange(t.ctrChange)} vs the previous period. Refresh it with a new version.`
            : "stopped bringing results this period. Refresh it with a new version.",
      actions: [
        { label: "New version", onClick: () => conceptActions.onNewVersion(c) },
        ...(latest?.kind === "image" ? [{ label: "AI variations", onClick: () => fileActions.onVariations(latest) }] : []),
      ],
    });
  }

  const spend = (c: Concept) => library.performance[c.code]?.spend ?? 0;
  const winners = active.filter((c) => statusOf(c).status === "winner").sort((a, b) => spend(b) - spend(a));
  for (const c of winners) {
    const gaps = conceptGaps(c);
    const latest = c.versions[0]?.files[0];
    if (latest && (gaps.story || gaps.feed)) {
      steps.push({
        key: `gap-${c.code}`,
        tone: "warning",
        concept: c,
        text: `is winning but has no ${gaps.story ? "9:16 story" : "4:5 feed"} size — it is losing ${gaps.story ? "Stories and Reels" : "feed"} reach.`,
        actions: [{ label: "Add size", onClick: () => fileActions.onAddSize(latest) }],
      });
    }
    if (c.versions.length === 1 && latest && !props.trendOf(c)?.fatigue) {
      steps.push({
        key: `iterate-${c.code}`,
        tone: "success",
        concept: c,
        text: "is winning with a single version — make the next one before it fatigues.",
        actions: [
          { label: "New version", onClick: () => conceptActions.onNewVersion(c) },
          ...(latest.kind === "image" ? [{ label: "AI variations", onClick: () => fileActions.onVariations(latest) }] : []),
        ],
      });
    }
  }

  const losers = active.filter((c) => statusOf(c).status === "pause").sort((a, b) => spend(b) - spend(a));
  for (const c of losers) {
    steps.push({
      key: `pause-${c.code}`,
      tone: "warning",
      concept: c,
      text: `costs too much per result (${fmtMoney(library.performance[c.code]?.spend)} spent) — pause the ad in Meta and archive it.`,
      actions: [{ label: "Archive", onClick: () => conceptActions.onStatus(c, "archived") }],
    });
  }

  if (library.metrics.unmatched.length) {
    const n = library.metrics.unmatched.length;
    steps.push({
      key: "unmatched",
      tone: "warning",
      text: `${n}${n >= 50 ? "+" : ""} ad${n > 1 ? "s" : ""} in Meta have no known creative code — their results are not counted.`,
      actions: [{ label: "See them", onClick: props.onOpenPerformance }],
    });
  }

  const notLive = hasMetrics ? active.filter((c) => !library.performance[c.code]).length : 0;
  if (notLive) {
    steps.push({
      key: "untested",
      tone: "muted",
      text: `${notLive} concept${notLive > 1 ? "s are" : " is"} not live yet — no results in the last import.`,
      actions: [{ label: "See them", onClick: () => navigate({ kind: "smart", id: "untested" }) }],
    });
  }

  if (!steps.length) return null;
  const shown = showAll ? steps : steps.slice(0, NEXT_STEPS_SHOWN);
  return (
    <section className="rounded-lg border border-border bg-panel">
      <h3 className="border-b border-border px-3 py-2 text-xs font-semibold">Next steps</h3>
      <ul className="divide-y divide-border">
        {shown.map((s) => (
          <li key={s.key} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs">
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                s.tone === "warning" ? "bg-warning" : s.tone === "success" ? "bg-success" : "bg-muted-foreground/50",
              )}
            />
            <p className="min-w-0 flex-1">
              {s.concept ? (
                <button
                  type="button"
                  onClick={() => navigate({ kind: "concept", code: s.concept!.code })}
                  className="mr-1 font-mono font-medium hover:text-accent hover:underline"
                >
                  {creativeCode(s.concept.code)} · {s.concept.angle}
                </button>
              ) : null}
              <span className="text-muted-foreground">{s.text}</span>
            </p>
            <span className="flex gap-1">
              {s.actions.map((a) => (
                <Button key={a.label} size="xs" onClick={a.onClick}>
                  {a.label}
                </Button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {steps.length > NEXT_STEPS_SHOWN ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-t border-border px-3 py-1.5 text-left text-2xs text-muted-foreground hover:text-foreground"
        >
          {showAll ? "Show less" : `Show ${steps.length - NEXT_STEPS_SHOWN} more`}
        </button>
      ) : null}
    </section>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  tone?: "warning" | "success";
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-lg border border-border bg-panel px-3 py-2 text-left transition-colors",
        onClick && "hover:border-accent/60",
      )}
    >
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      <p className="truncate text-2xs text-muted-foreground">{hint}</p>
    </Comp>
  );
}

function FolderTile({
  name,
  concepts,
  onOpen,
  onDropConcept,
}: {
  name: string;
  concepts: Concept[];
  onOpen: () => void;
  onDropConcept: (code: number) => void;
}) {
  const drop = useConceptDrop(onDropConcept);
  const covers = concepts.slice(0, 4).map(coverOf);
  const files = concepts.reduce((n, c) => n + c.files.length, 0);
  const gaps = concepts.filter((c) => conceptGaps(c).feed || conceptGaps(c).story).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      {...drop.props}
      className={cn(
        "group overflow-hidden rounded-lg border bg-panel text-left transition-colors hover:border-accent/60",
        drop.over ? "border-accent ring-2 ring-accent" : "border-border",
      )}
    >
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5 bg-muted">
        {covers.length ? (
          covers.map((f, i) => (
            <div key={f.id} className={cn("overflow-hidden bg-muted", covers.length === 1 && "col-span-2 row-span-2", covers.length === 2 && "row-span-2", covers.length === 3 && i === 0 && "row-span-2")}>
              {f.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : null}
            </div>
          ))
        ) : (
          <div className="col-span-2 row-span-2 flex items-center justify-center text-muted-foreground">
            <Folder className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
          <Folder className="h-3.5 w-3.5 shrink-0 text-accent" />
          {name}
        </p>
        <p className="flex items-center gap-1 text-2xs text-muted-foreground">
          {concepts.length ? `${concepts.length} concept${concepts.length > 1 ? "s" : ""} · ${files} files` : "Empty"}
          {gaps ? (
            <span className="ml-auto flex items-center gap-0.5 text-warning" title="Concepts missing a size">
              <AlertTriangle className="h-3 w-3" /> {gaps}
            </span>
          ) : null}
        </p>
      </div>
    </button>
  );
}

function NewFolderTile({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState("");
  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
      {editing ? (
        <form
          className="flex w-full items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void onCreate(name).then(() => {
              setEditing(false);
              setName("");
            });
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            placeholder="Product name"
            className="h-7 text-xs"
          />
          <Button type="submit" size="icon-sm" variant="ghost" title="Create">
            <Check className="h-3.5 w-3.5" />
          </Button>
        </form>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="flex flex-col items-center gap-1 hover:text-foreground">
          <FolderPlus className="h-6 w-6" />
          New folder
        </button>
      )}
    </div>
  );
}

function FolderView(props: Props & { folder: string; list: Concept[] }) {
  const { folder, list, navigate, concepts, statusOf } = props;
  const archived = concepts.filter((c) => c.product === folder && statusOf(c).status === "archived").length;
  return (
    <>
      <Breadcrumb
        items={[{ label: "Creatives", onClick: () => navigate({ kind: "root" }) }, { label: folder }]}
        actions={
          <>
            <ViewToggle view={props.view} onChange={props.onViewChange} />
            {list.length ? (
              <Button size="sm" onClick={() => props.onShare({ scope: "folder", value: folder, label: `folder ${folder}` })}>
                <Link2 className="h-3.5 w-3.5" /> Share
              </Button>
            ) : null}
            <Button size="sm" onClick={() => props.onImport(folder)}>
              <Upload className="h-3.5 w-3.5" /> Import here
            </Button>
            <Button size="sm" variant="primary" onClick={() => props.onNewConcept(folder)}>
              <Plus className="h-3.5 w-3.5" /> New concept
            </Button>
          </>
        }
      />
      <ConceptCollection
        {...props}
        list={list}
        empty="This folder is empty. Import files here, create a concept, or drag concepts in from other folders."
      />
      {archived ? (
        <p className="text-2xs text-muted-foreground">
          {archived} archived concept{archived > 1 ? "s" : ""} in this folder —{" "}
          <button type="button" className="underline" onClick={() => navigate({ kind: "smart", id: "archived" })}>
            see Archived
          </button>
        </p>
      ) : null}
    </>
  );
}

function trashDaysLeft(trashedAt: string): string {
  const left = Math.ceil(CREATIVE_TRASH_DAYS - (Date.now() - new Date(trashedAt).getTime()) / 86_400_000);
  return left <= 1 ? "deleted for good within a day" : `deleted for good in ${left} days`;
}

function TrashView(props: Props) {
  const { trash, navigate, conceptActions } = props;
  return (
    <>
      <Breadcrumb
        items={[{ label: "Creatives", onClick: () => navigate({ kind: "root" }) }, { label: "Trash" }]}
        actions={
          trash.length ? (
            <Button size="sm" variant="destructive" onClick={conceptActions.onEmptyTrash}>
              <Trash2 className="h-3.5 w-3.5" /> Empty trash
            </Button>
          ) : null
        }
      />
      <p className="text-2xs text-muted-foreground">
        Concepts in the trash are hidden from folders, views and share links, and are deleted for good after{" "}
        {CREATIVE_TRASH_DAYS} days.
      </p>
      {trash.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          The trash is empty.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {trash.map((c) => {
            const cover = coverOf(c);
            return (
              <div key={c.code} className="flex flex-col overflow-hidden rounded-lg border border-border bg-panel">
                <button
                  type="button"
                  onClick={() => navigate({ kind: "concept", code: c.code })}
                  className="text-left"
                  title="Open"
                >
                  <div className="relative aspect-[4/5] bg-muted">
                    {cover.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover.thumbUrl}
                        alt=""
                        className="h-full w-full object-cover opacity-60 grayscale"
                        loading="lazy"
                      />
                    ) : null}
                    <span className="absolute left-1.5 top-1.5 rounded bg-background/90 px-1.5 font-mono text-2xs font-semibold leading-5">
                      {creativeCode(c.code)}
                    </span>
                  </div>
                  <div className="space-y-0.5 px-2.5 py-2">
                    <p className="truncate text-sm font-medium">{c.angle}</p>
                    <p className="truncate text-2xs text-muted-foreground">
                      {c.product} · {c.trashedAt ? trashDaysLeft(c.trashedAt) : ""}
                    </p>
                  </div>
                </button>
                <div className="mt-auto flex gap-1 px-2.5 pb-2">
                  <Button size="xs" className="flex-1" onClick={() => conceptActions.onRestore(c)}>
                    <RotateCcw className="h-3 w-3" /> Restore
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-destructive"
                    title="Delete forever"
                    onClick={() => conceptActions.onDeleteForever(c)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ConceptCollection(props: Props & { list: Concept[]; showFolder?: boolean; empty: string }) {
  const { list, showFolder, empty, view, statusOf, hasMetrics, navigate, library } = props;
  if (!list.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
        {empty}
      </div>
    );
  }
  if (view === "list") return <ConceptTable {...props} list={list} />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {list.map((c) => (
        <ConceptTile
          key={c.code}
          concept={c}
          status={statusOf(c)}
          showStatus={hasMetrics || !statusOf(c).suggested}
          showFolder={showFolder}
          perf={library.performance[c.code]}
          trend={props.trendOf(c)}
          onOpen={() => navigate({ kind: "concept", code: c.code })}
          onUsage={(u) => props.conceptActions.onUsage(c, u)}
          onTrash={() => props.conceptActions.onTrash(c)}
        />
      ))}
    </div>
  );
}

function ConceptTile({
  concept: c,
  status,
  showStatus,
  showFolder,
  perf,
  trend,
  onOpen,
  onUsage,
  onTrash,
}: {
  concept: Concept;
  status: ConceptStatus;
  showStatus: boolean;
  showFolder?: boolean;
  perf: CreativeLibrary["performance"][number] | undefined;
  trend: PerformanceTrend | null;
  onOpen: () => void;
  onUsage: (u: CreativeUsage) => void;
  onTrash: () => void;
}) {
  const cover = coverOf(c);
  const gaps = conceptGaps(c);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(CONCEPT_DRAG_TYPE, String(c.code));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border border-border bg-panel transition-colors hover:border-accent/60",
        c.usage === "old" && "opacity-60 hover:opacity-100",
      )}
    >
      <button type="button" onClick={onOpen} className="text-left" title="Open · drag onto a folder to move">
        <div className="relative aspect-[4/5] bg-muted">
          {cover.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
          ) : null}
          <span className="absolute left-1.5 top-1.5 rounded bg-background/90 px-1.5 font-mono text-2xs font-semibold leading-5">
            {creativeCode(c.code)}
          </span>
          {showStatus ? (
            <span className="absolute right-1.5 top-1.5">
              <StatusBadge status={status.status} suggested={status.suggested} />
            </span>
          ) : null}
          {gaps.feed || gaps.story ? (
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded bg-background/90 px-1 text-[10px] leading-4 text-warning">
              <AlertTriangle className="h-2.5 w-2.5" />
              needs {[gaps.feed && "4:5", gaps.story && "9:16"].filter(Boolean).join(" · ")}
            </span>
          ) : null}
          {trend && (trend.fatigue || trend.improving) ? (
            <span className="absolute bottom-1.5 right-1.5">
              <TrendBadge trend={trend} />
            </span>
          ) : null}
        </div>
        <div className="space-y-0.5 px-2.5 py-2">
          <p className="truncate text-sm font-medium">{c.angle}</p>
          <p className="truncate text-2xs text-muted-foreground">
            {showFolder ? `${c.product} · ` : ""}
            {c.format}
            {c.format === "UGC" && c.creator ? ` · ${c.creator}` : ""} · {c.versions.length} version
            {c.versions.length > 1 ? "s" : ""} · {c.files.length} file{c.files.length > 1 ? "s" : ""}
          </p>
          {perf ? (
            <p className="truncate text-2xs text-muted-foreground">
              {fmtMoney(perf.spend)} · {fmtMoney(perf.cpa)}/result · CTR {fmtPct(perf.ctr)}
            </p>
          ) : null}
        </div>
      </button>
      <div className="mt-auto px-2.5 pb-2">
        <UsageSelect concept={c} onChange={onUsage} onTrash={onTrash} className="h-6 w-full text-2xs" />
      </div>
    </div>
  );
}

function ConceptTable(props: Props & { list: Concept[] }) {
  const { list, statusOf, hasMetrics, library, navigate, conceptActions } = props;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-2xs text-muted-foreground">
          <tr>
            <th className="w-12 px-2 py-1.5" />
            <th className="px-2 py-1.5 text-left font-medium">Concept</th>
            <th className="px-2 py-1.5 text-left font-medium">Latest version · sizes</th>
            <th className="px-2 py-1.5 text-left font-medium">Usage</th>
            <th className="px-2 py-1.5 text-left font-medium">Status</th>
            {hasMetrics ? (
              <>
                <th className="px-2 py-1.5 text-right font-medium">Spend</th>
                <th className="px-2 py-1.5 text-right font-medium">Cost / result</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {list.map((c) => {
            const latest = c.versions[0];
            const cover = coverOf(c);
            const gaps = conceptGaps(c);
            const s = statusOf(c);
            const p = library.performance[c.code];
            return (
              <tr
                key={c.code}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(CONCEPT_DRAG_TYPE, String(c.code))}
                onClick={() => navigate({ kind: "concept", code: c.code })}
                className="cursor-pointer border-t border-border align-middle hover:bg-muted/40"
              >
                <td className="px-2 py-1.5">
                  <div className="h-12 w-9 overflow-hidden rounded bg-muted">
                    {cover.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
                    ) : null}
                  </div>
                </td>
                <td className="max-w-[320px] px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold">{creativeCode(c.code)}</span>
                    <Badge variant="accent">{c.product}</Badge>
                    <span className="truncate font-medium">{c.angle}</span>
                  </div>
                  <p className="truncate text-2xs text-muted-foreground">
                    {c.format}
                    {c.format === "UGC" && c.creator ? ` · ${c.creator}` : ""}
                    {c.hook ? ` · “${c.hook}”` : ""}
                  </p>
                </td>
                <td className="px-2 py-1.5">
                  <span className="font-mono text-2xs text-muted-foreground">v{latest.version}</span>
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {latest.files.map((f) => (
                      <Badge key={f.id} variant={f.aspectRatio === "2x3" ? "warning" : "default"}>
                        {f.aspectRatio.replace("x", ":")}
                      </Badge>
                    ))}
                    {gaps.feed ? <Badge variant="outline" className="border-dashed text-warning">+4:5</Badge> : null}
                    {gaps.story ? <Badge variant="outline" className="border-dashed text-warning">+9:16</Badge> : null}
                  </div>
                </td>
                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <UsageSelect
                    concept={c}
                    onChange={(u) => conceptActions.onUsage(c, u)}
                    onTrash={() => conceptActions.onTrash(c)}
                  />
                </td>
                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {hasMetrics || !s.suggested ? <StatusBadge status={s.status} suggested={s.suggested} /> : null}
                    <StatusSelect concept={c} onChange={(v) => conceptActions.onStatus(c, v)} />
                  </div>
                </td>
                {hasMetrics ? (
                  <>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p ? fmtMoney(p.spend) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {p ? fmtMoney(p.cpa) : "—"}
                      {(() => {
                        const t = props.trendOf(c);
                        return t ? (
                          <div>
                            <TrendBadge trend={t} />
                          </div>
                        ) : null;
                      })()}
                    </td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Cost per result of the concept in each imported period, oldest first. */
function ConceptHistory({
  concept: c,
  periods,
  currentId,
}: {
  concept: Concept;
  periods: CreativeLibrary["periods"];
  currentId: string | null;
}) {
  const running = [...periods].reverse().filter((p) => p.performance[c.code]);
  if (running.length < 2) return null;
  const max = Math.max(...running.map((p) => p.performance[c.code]!.cpa ?? 0), 0.01);
  return (
    <div className="pt-1">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Cost per result by period
      </p>
      <div className="flex items-end gap-1.5 overflow-x-auto pb-0.5">
        {running.map((p, i) => {
          const cur = p.performance[c.code]!;
          const prev = i > 0 ? running[i - 1].performance[c.code] : undefined;
          const worse = cur.cpa != null && prev?.cpa != null && cur.cpa >= prev.cpa * 1.3;
          const better = cur.cpa != null && prev?.cpa != null && cur.cpa <= prev.cpa * 0.8;
          return (
            <div
              key={p.id}
              className="flex w-16 shrink-0 flex-col items-center gap-0.5"
              title={`${fmtMoney(cur.spend)} spent · ${Math.round(cur.results)} results · CTR ${fmtPct(cur.ctr)}`}
            >
              <span className={cn("text-[10px] tabular-nums", worse && "text-destructive", better && "text-success")}>
                {cur.cpa != null ? fmtMoney(cur.cpa) : "no result"}
              </span>
              <div className="flex h-10 w-6 items-end rounded-sm bg-muted">
                <div
                  className={cn(
                    "w-full rounded-sm",
                    worse ? "bg-destructive/70" : better ? "bg-success/70" : "bg-accent/60",
                    cur.cpa == null && "bg-destructive/30",
                  )}
                  style={{ height: `${cur.cpa != null ? Math.max(8, (cur.cpa / max) * 100) : 100}%` }}
                />
              </div>
              <span
                className={cn(
                  "w-full truncate text-center text-[10px] text-muted-foreground",
                  p.id === currentId && "font-semibold text-foreground",
                )}
              >
                {periodLabel(p)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConceptDetail(props: Props & { concept: Concept }) {
  const { concept: c, navigate, statusOf, hasMetrics, library, fileActions, conceptActions } = props;
  const status = statusOf(c);
  const perf = library.performance[c.code];
  const gaps = conceptGaps(c);
  const versionPerf = (v: number) => library.versionPerformance[`${c.code}:${v}`];
  const judged = c.versions.filter((v) => versionPerf(v.version)?.cpa != null);
  const bestVersion =
    judged.length > 1
      ? judged.reduce((a, b) => (versionPerf(b.version)!.cpa! < versionPerf(a.version)!.cpa! ? b : a)).version
      : null;
  return (
    <>
      <Breadcrumb
        items={[
          { label: "Creatives", onClick: () => navigate({ kind: "root" }) },
          { label: c.product, onClick: () => navigate({ kind: "folder", folder: c.product }) },
          { label: `${creativeCode(c.code)} · ${c.angle}` },
        ]}
        actions={
          c.trashedAt ? (
            <>
              <Button size="sm" onClick={() => conceptActions.onRestore(c)}>
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </Button>
              <Button size="sm" variant="destructive" onClick={() => conceptActions.onDeleteForever(c)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete forever
              </Button>
            </>
          ) : (
            <>
              <UsageSelect
                concept={c}
                onChange={(u) => conceptActions.onUsage(c, u)}
                onTrash={() => {
                  conceptActions.onTrash(c);
                  navigate({ kind: "folder", folder: c.product });
                }}
              />
              <StatusSelect concept={c} onChange={(v) => conceptActions.onStatus(c, v)} />
              <Button
                size="sm"
                onClick={() =>
                  props.onShare({ scope: "concept", value: String(c.code), label: `${creativeCode(c.code)} · ${c.angle}` })
                }
              >
                <Link2 className="h-3.5 w-3.5" /> Share
              </Button>
              <Button size="sm" onClick={() => conceptActions.onEdit(c)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button size="sm" variant="primary" onClick={() => conceptActions.onNewVersion(c)}>
                <Plus className="h-3.5 w-3.5" /> New version
              </Button>
            </>
          )
        }
      />

      {c.trashedAt ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
          <Trash2 className="h-3.5 w-3.5 shrink-0 text-destructive" />
          In the trash — {trashDaysLeft(c.trashedAt)}. Restore it to use it again.
        </div>
      ) : null}

      <section className="space-y-1 rounded-lg border border-border bg-panel px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-sm font-semibold">{creativeCode(c.code)}</span>
          <Badge variant="accent">{c.product}</Badge>
          <Badge variant="outline">
            {c.format}
            {c.format === "UGC" && c.creator ? ` · ${c.creator}` : ""}
          </Badge>
          {hasMetrics || !status.suggested ? <StatusBadge status={status.status} suggested={status.suggested} /> : null}
          <span className="text-sm font-medium">{c.angle}</span>
        </div>
        {c.hook ? <p className="text-xs text-muted-foreground">“{c.hook}”</p> : null}
        {c.notes ? <p className="text-2xs italic text-muted-foreground">{c.notes}</p> : null}
        {perf ? (
          <p className="text-2xs text-muted-foreground">
            Spend <b className="text-foreground">{fmtMoney(perf.spend)}</b> · Results{" "}
            <b className="text-foreground">{Math.round(perf.results)}</b> · Cost/result{" "}
            <b className="text-foreground">{fmtMoney(perf.cpa)}</b> · CTR {fmtPct(perf.ctr)} · {perf.ads} ad
            {perf.ads === 1 ? "" : "s"}
            {props.trendOf(c) ? (
              <span className="ml-1.5 inline-block align-middle">
                <TrendBadge trend={props.trendOf(c)!} />
              </span>
            ) : null}
          </p>
        ) : null}
        <ConceptHistory concept={c} periods={library.periods} currentId={library.metrics.periodId} />
      </section>

      {c.versions.map((v, i) => {
        const vp = versionPerf(v.version);
        return (
        <section key={v.version} className="rounded-lg border border-border bg-panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Version {v.version}</span>
            {i === 0 ? <Badge variant="accent">latest</Badge> : null}
            {bestVersion === v.version ? (
              <Badge variant="success" title="Lowest cost per result among the versions of this concept">
                <Trophy className="mr-0.5 h-3 w-3" /> best
              </Badge>
            ) : null}
            <button
              type="button"
              onClick={() => fileActions.onCopy(adNameOf(v.files[0]))}
              title="Copy the ad name for Meta"
              className="flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <span className="truncate">{adNameOf(v.files[0])}</span>
              <Copy className="h-3 w-3 shrink-0" />
            </button>
            {vp ? (
              <span className="text-2xs text-muted-foreground">
                {fmtMoney(vp.spend)} spent · {fmtMoney(vp.cpa)}/result · CTR {fmtPct(vp.ctr)}
              </span>
            ) : null}
            <span className="ml-auto flex items-center gap-2">
              {i === 0 && (gaps.feed || gaps.story) ? (
                <span className="flex items-center gap-1 text-2xs text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  Missing {[gaps.feed && "4:5 feed", gaps.story && "9:16 story"].filter(Boolean).join(" and ")}
                </span>
              ) : null}
              <Button asChild size="xs" title="Every size of this version with the standard names, plus the ad name">
                <a href={`/api/creatives/concepts/${c.code}/download?version=${v.version}`}>
                  <Download className="h-3 w-3" /> ZIP for Meta
                </a>
              </Button>
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-3 p-3">
            {v.files.map((f) => (
              <div key={f.id} className="space-y-1">
                <FileThumb file={f} actions={fileActions} className="h-60" />
                <p className="text-center text-2xs text-muted-foreground">
                  {f.aspectRatio.replace("x", ":")}
                  {f.width && f.height ? ` · ${f.width}×${f.height}` : ""}
                </p>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileActions.onAddSize(v.files[0])}
              className="flex h-60 w-32 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:border-accent/60 hover:text-foreground"
            >
              <Plus className="h-5 w-5" />
              Add size
            </button>
          </div>
        </section>
        );
      })}
    </>
  );
}

