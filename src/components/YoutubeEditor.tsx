"use client";

import * as React from "react";
import { Loader2, RefreshCw, Save, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import type { Project, YoutubeMetadata } from "@/lib/db/schema";
import { jsonSafeParse } from "@/lib/utils";

interface Props {
  project: Project;
  initial: YoutubeMetadata | null;
}

export function YoutubeEditor({ project, initial }: Props) {
  const { toast } = useToast();
  const [data, setData] = React.useState<YoutubeMetadata | null>(initial);
  const [generating, setGenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [selectedTitle, setSelectedTitle] = React.useState(initial?.selectedTitle ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [tags, setTags] = React.useState<string>(
    jsonSafeParse<string[]>(initial?.tags ?? "[]", []).join(", "),
  );

  const titleOptions = React.useMemo(
    () => jsonSafeParse<string[]>(data?.titleOptions ?? "[]", []),
    [data?.titleOptions],
  );

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/youtube`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const json = await res.json();
      setData(json.youtube);
      setSelectedTitle(json.youtube.selectedTitle ?? "");
      setDescription(json.youtube.description ?? "");
      setTags(jsonSafeParse<string[]>(json.youtube.tags ?? "[]", []).join(", "));
      toast({ variant: "success", title: "Metadata generated" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/youtube`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedTitle,
          description,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ variant: "success", title: "Saved" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel p-8 text-center">
        <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm">No YouTube metadata yet.</p>
        <p className="text-2xs text-muted-foreground">
          Generate a thumbnail, titles, description and tags from your blocks.
        </p>
        <Button
          onClick={generate}
          variant="primary"
          size="md"
          className="mt-3"
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Generate metadata
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3 rounded-lg border border-border bg-background p-4">
        <div>
          <Label>Title options</Label>
          <div className="mt-1 space-y-1.5">
            {titleOptions.map((t, i) => {
              const active = t === selectedTitle;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => setSelectedTitle(t)}
                  className={`block w-full rounded-md border px-3 py-1.5 text-left text-xs ${
                    active
                      ? "border-accent bg-accent/10"
                      : "border-border bg-panel hover:border-accent/40"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Label>Selected title (editable)</Label>
          <Input
            value={selectedTitle}
            onChange={(e) => setSelectedTitle(e.target.value)}
            placeholder="Final title"
          />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[180px] font-mono text-xs"
          />
        </div>
        <div>
          <Label>Tags (comma separated)</Label>
          <Textarea
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="min-h-[64px]"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Regenerate
          </Button>
          <Button variant="primary" size="md" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <div className="aspect-video w-full bg-black">
            {data.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xs text-white/60">
                No thumbnail yet
              </div>
            )}
          </div>
          <div className="px-3 py-2 text-2xs text-muted-foreground">
            1280×720 thumbnail
          </div>
        </div>
      </div>
    </div>
  );
}
