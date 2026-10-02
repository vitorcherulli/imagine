"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Megaphone, Search, Upload, Wand2 } from "lucide-react";
import type { Creative } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  DEFAULT_MIN_SPEND,
  comparePerformance,
  creativeCode,
  suggestStatuses,
  toProductCode,
  viewPeriod,
} from "@/lib/creatives";
import {
  ConceptEditDialog,
  FileEditDialog,
  FromVariationsDialog,
  GenerateVariationsDialog,
  UploadDialog,
  sendJson,
  type UploadTarget,
} from "@/components/creatives/CreativeDialogs";
import { BulkImportDialog, collectDropped, type DroppedFile } from "@/components/creatives/BulkImportDialog";
import { ShareDialog, type ShareTarget } from "@/components/creatives/ShareDialog";
import {
  CreativesExplorer,
  locFromParams,
  locToSearch,
  type ConceptActions,
  type FolderActions,
  type LibraryView,
  type Loc,
} from "@/components/creatives/CreativesExplorer";
import { CreativesPerformance } from "@/components/creatives/CreativesPerformance";
import { CreativesGuide } from "@/components/creatives/CreativesGuide";
import { PreviewDialog, type ConceptStatus, type FileActions } from "@/components/creatives/parts";
import { groupConcepts, nameOf, type Concept, type CreativeLibrary } from "@/components/creatives/shared";

const MIN_SPEND_KEY = "creatives:minSpend";
const VIEW_KEY = "creatives:view";

export function CreativesManager({ initial }: { initial: CreativeLibrary }) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const loc = React.useMemo(() => locFromParams(new URLSearchParams(searchParams?.toString())), [searchParams]);

  const [rawLibrary, setLibrary] = React.useState(initial);
  const [periodId, setPeriodId] = React.useState<string | null>(null);
  const library = React.useMemo(
    () => ({ ...rawLibrary, ...viewPeriod(rawLibrary.periods, periodId) }),
    [rawLibrary, periodId],
  );
  const [tab, setTab] = React.useState("library");
  const [view, setView] = React.useState<LibraryView>("grid");
  const [query, setQuery] = React.useState("");
  const [minSpend, setMinSpend] = React.useState(DEFAULT_MIN_SPEND);

  const [upload, setUpload] = React.useState<UploadTarget | null>(null);
  const [editConcept, setEditConcept] = React.useState<Concept | null>(null);
  const [editFile, setEditFile] = React.useState<Creative | null>(null);
  const [variationsFor, setVariationsFor] = React.useState<Creative | null>(null);
  const [preview, setPreview] = React.useState<Creative | null>(null);
  const [fromVariations, setFromVariations] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkFolder, setBulkFolder] = React.useState<string | null>(null);
  const [bulkIncoming, setBulkIncoming] = React.useState<DroppedFile[] | null>(null);
  const [pageDrag, setPageDrag] = React.useState(false);
  const [shareTarget, setShareTarget] = React.useState<ShareTarget | null>(null);
  const dragDepth = React.useRef(0);

  React.useEffect(() => {
    const saved = Number(window.localStorage.getItem(MIN_SPEND_KEY));
    if (Number.isFinite(saved) && saved > 0) setMinSpend(saved);
    if (window.localStorage.getItem(VIEW_KEY) === "list") setView("list");
  }, []);

  const refresh = React.useCallback(async () => {
    const res = await fetch("/api/creatives", { cache: "no-store" });
    if (res.ok) setLibrary((await res.json()) as CreativeLibrary);
  }, []);

  const navigate = React.useCallback((next: Loc) => {
    setQuery("");
    setTab("library");
    window.history.pushState(null, "", `${window.location.pathname}${locToSearch(next)}`);
  }, []);

  const hasMetrics = library.metrics.rows > 0;
  const concepts = React.useMemo(() => groupConcepts(library.creatives), [library.creatives]);
  const products = React.useMemo(
    () => [...new Set([...library.folders, ...concepts.map((c) => c.product)])].sort(),
    [library.folders, concepts],
  );
  const suggested = React.useMemo(
    () => suggestStatuses(concepts, library.performance, minSpend),
    [concepts, library.performance, minSpend],
  );
  const statusOf = React.useCallback(
    (c: Concept): ConceptStatus =>
      c.manualStatus
        ? { status: c.manualStatus, suggested: false }
        : { status: suggested[c.code] ?? "untested", suggested: true },
    [suggested],
  );
  const trendOf = React.useCallback(
    (c: Concept) => comparePerformance(library.performance[c.code], library.previousPerformance[c.code], minSpend),
    [library, minSpend],
  );

  const nextCode = Math.max(0, ...library.creatives.map((c) => c.code)) + 1;
  const nextVersion = (code: number) =>
    Math.max(0, ...library.creatives.filter((c) => c.code === code).map((c) => c.version)) + 1;

  const currentFolder =
    loc.kind === "folder"
      ? loc.folder
      : loc.kind === "concept"
        ? concepts.find((c) => c.code === loc.code)?.product ?? null
        : null;

  function fail(title: string, err: unknown) {
    toast({ title, description: err instanceof Error ? err.message : String(err), variant: "destructive" });
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: text });
  }

  function openImport(folder: string | null, files: DroppedFile[] | null = null) {
    setBulkFolder(folder);
    setBulkIncoming(files);
    setBulkOpen(true);
  }

  const fileActions: FileActions = {
    onAddSize: (f) => setUpload({ mode: "size", base: f }),
    onEditFile: setEditFile,
    onDeleteFile: (f) => {
      if (!window.confirm(`Delete ${nameOf(f)}? The file is removed from the library.`)) return;
      sendJson(`/api/creatives/${f.id}`, "DELETE")
        .then(refresh)
        .catch((e) => fail("Could not delete", e));
    },
    onCopy: copy,
    onPreview: setPreview,
    onVariations: setVariationsFor,
  };

  const conceptActions: ConceptActions = {
    onStatus: (c, value) => {
      sendJson(`/api/creatives/concepts/${c.code}`, "PATCH", { status: value === "auto" ? null : value })
        .then(refresh)
        .catch((e) => fail("Could not update", e));
    },
    onEdit: setEditConcept,
    onNewVersion: (c) => setUpload({ mode: "version", base: c.versions[0].files[0] }),
  };

  const folderActions: FolderActions = {
    create: async (name) => {
      if (!toProductCode(name)) return null;
      try {
        const data = (await sendJson("/api/creatives/folders", "POST", { name })) as { name?: string };
        await refresh();
        return data.name ?? null;
      } catch (e) {
        fail("Could not create folder", e);
        return null;
      }
    },
    rename: async (from, to) => {
      try {
        const data = (await sendJson("/api/creatives/folders", "PATCH", { from, to })) as { name?: string };
        await refresh();
        if (data.name && loc.kind === "folder" && loc.folder === from) navigate({ kind: "folder", folder: data.name });
        toast({ title: "Folder renamed", description: "File and ad names inside now use the new name." });
      } catch (e) {
        fail("Could not rename folder", e);
      }
    },
    remove: async (name) => {
      if (!window.confirm(`Delete the empty folder ${name}?`)) return;
      try {
        await sendJson("/api/creatives/folders", "DELETE", { name });
        await refresh();
        if (loc.kind === "folder" && loc.folder === name) navigate({ kind: "root" });
      } catch (e) {
        fail("Could not delete folder", e);
      }
    },
    move: async (code, folder) => {
      const c = concepts.find((x) => x.code === code);
      if (!c || c.product === folder) return;
      try {
        await sendJson(`/api/creatives/concepts/${code}`, "PATCH", { product: folder });
        await refresh();
        toast({ title: `${creativeCode(code)} moved to ${folder}` });
      } catch (e) {
        fail("Could not move", e);
      }
    },
  };

  const anyDialogOpen =
    bulkOpen ||
    !!upload ||
    !!editConcept ||
    !!editFile ||
    !!variationsFor ||
    !!preview ||
    fromVariations ||
    !!shareTarget;
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      className="relative mx-auto min-h-full max-w-6xl px-5 py-5"
      onDragEnter={(e) => {
        if (anyDialogOpen || !hasFiles(e)) return;
        dragDepth.current += 1;
        setPageDrag(true);
      }}
      onDragOver={(e) => {
        if (!anyDialogOpen && hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setPageDrag(false);
      }}
      onDrop={(e) => {
        if (anyDialogOpen || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setPageDrag(false);
        void collectDropped(e.dataTransfer).then((files) => openImport(currentFolder, files));
      }}
    >
      {pageDrag ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
          <div className="rounded-lg border-2 border-dashed border-accent bg-background px-6 py-4 text-center shadow-lg">
            <Upload className="mx-auto mb-1 h-5 w-5 text-accent" />
            <p className="text-sm font-medium">Drop to import{currentFolder ? ` into ${currentFolder}` : ""}</p>
            <p className="text-2xs text-muted-foreground">Files or whole folders — you review names before importing</p>
          </div>
        </div>
      ) : null}

      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-1.5 text-base font-semibold">
            <Megaphone className="h-4 w-4 text-accent" /> Creatives
          </h1>
          <p className="text-2xs text-muted-foreground">
            Folders by product, one concept per hook, versions and sizes inside — with standard names and results.
          </p>
        </div>
        <Button size="sm" onClick={() => setFromVariations(true)}>
          <Wand2 className="h-3.5 w-3.5" /> Add from Variations
        </Button>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="guide">Naming guide</TabsTrigger>
          </TabsList>
          {tab === "library" ? (
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search all folders…"
                className="pl-7"
              />
            </div>
          ) : null}
        </div>

        <TabsContent value="library" className="mt-3">
          <CreativesExplorer
            library={library}
            concepts={concepts}
            statusOf={statusOf}
            trendOf={trendOf}
            hasMetrics={hasMetrics}
            loc={loc}
            navigate={navigate}
            query={query}
            view={view}
            onViewChange={(v) => {
              setView(v);
              window.localStorage.setItem(VIEW_KEY, v);
            }}
            fileActions={fileActions}
            conceptActions={conceptActions}
            folderActions={folderActions}
            onNewConcept={(folder) => setUpload({ mode: "new", product: folder ?? undefined })}
            onImport={(folder) => openImport(folder)}
            onOpenPerformance={() => setTab("performance")}
            onShare={setShareTarget}
          />
        </TabsContent>

        <TabsContent value="performance" className="mt-3">
          <CreativesPerformance
            library={library}
            concepts={concepts}
            statusOf={statusOf}
            trendOf={trendOf}
            minSpend={minSpend}
            onMinSpendChange={(n) => {
              setMinSpend(n);
              window.localStorage.setItem(MIN_SPEND_KEY, String(n));
            }}
            onPeriodChange={setPeriodId}
            onChanged={(newest) => {
              if (newest) setPeriodId(null);
              void refresh();
            }}
          />
        </TabsContent>

        <TabsContent value="guide" className="mt-3">
          <CreativesGuide />
        </TabsContent>
      </Tabs>

      <UploadDialog
        target={upload}
        onClose={() => setUpload(null)}
        nextCode={nextCode}
        nextVersion={nextVersion}
        products={products}
        onCreated={() => void refresh()}
      />
      <ConceptEditDialog
        concept={editConcept}
        onClose={() => setEditConcept(null)}
        products={products}
        onSaved={() => void refresh()}
      />
      <FileEditDialog creative={editFile} onClose={() => setEditFile(null)} onSaved={() => void refresh()} />
      <GenerateVariationsDialog creative={variationsFor} onClose={() => setVariationsFor(null)} />
      <FromVariationsDialog
        open={fromVariations}
        onClose={() => setFromVariations(false)}
        concepts={concepts}
        products={products}
        onCreated={() => void refresh()}
      />
      <PreviewDialog creative={preview} onClose={() => setPreview(null)} onCopy={copy} />
      <ShareDialog target={shareTarget} onClose={() => setShareTarget(null)} />
      <BulkImportDialog
        open={bulkOpen}
        incoming={bulkIncoming}
        onClose={() => {
          setBulkOpen(false);
          setBulkIncoming(null);
        }}
        creatives={library.creatives}
        folders={library.folders}
        defaultFolder={bulkFolder}
        onImported={() => void refresh()}
      />
    </div>
  );
}
