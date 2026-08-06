"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DUB_LANGUAGES } from "@/lib/dub-languages";
import { cn } from "@/lib/utils";
import { DubbingApiSettings } from "@/components/DubbingApiSettings";
import {
  getDefaultApiModels,
  type ProjectApiModels,
} from "@/lib/project-api-models";

export function NewDubbingForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = React.useState("pt");
  const [apiModels, setApiModels] = React.useState<ProjectApiModels>(getDefaultApiModels);
  const [useVoiceClone, setUseVoiceClone] = React.useState(false);
  const [backgroundGain, setBackgroundGain] = React.useState(0);
  const [voiceTone, setVoiceTone] = React.useState("natural");
  const [submitting, setSubmitting] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const canSubmit = title.trim().length > 0 && !!file && !submitting;

  function handleFile(f: File | null) {
    if (!f) {
      setFile(null);
      return;
    }
    const isVideo = f.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(f.name);
    const isAudio = f.type.startsWith("audio/") || /\.(mp3|m4a|wav)$/i.test(f.name);
    if (!isVideo && !isAudio) {
      toast({
        variant: "destructive",
        title: "Unsupported file",
        description: "Use MP4/MOV/WebM (video) or MP3/M4A/WAV (audio).",
      });
      return;
    }
    if (f.size > 500 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Max 500MB per upload.",
      });
      return;
    }
    setFile(f);
    if (!title.trim()) {
      const base = f.name.replace(/\.[^.]+$/, "").slice(0, 80);
      setTitle(base);
    }
  }

  async function submit() {
    if (!canSubmit || !file) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title.trim());
      form.append("targetLanguage", targetLanguage);
      form.append("useVoiceClone", useVoiceClone ? "true" : "false");
      form.append("ttsVoice", apiModels.ttsVoice);
      form.append("ttsModel", apiModels.ttsModel);
      form.append("llmModel", apiModels.llmModel);
      form.append("backgroundGain", String(backgroundGain));
      form.append("voiceTone", voiceTone.trim() || "natural");

      const res = await fetch("/api/dubs", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { id: string };
      toast({
        variant: "success",
        title: "Dubbing project created",
        description: "Redirecting to the editor…",
      });
      router.push(`/dubs/${data.id}`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not create dubbing project",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="dub-title">Project title</Label>
        <Input
          id="dub-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My video dubbed to Portuguese"
          maxLength={120}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Source file</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-m4v,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.mp4,.mov,.webm,.m4v,.mp3,.m4a,.wav"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded border-2 border-dashed border-border bg-panel px-4 py-8 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground",
            file && "border-primary/60 text-foreground",
          )}
        >
          <Upload className="h-4 w-4" />
          {file ? (
            <span className="truncate">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB
            </span>
          ) : (
            <span>Click to upload MP4/MOV/WebM or MP3/M4A/WAV (max 500MB)</span>
          )}
        </button>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1">
          <Languages className="h-3.5 w-3.5" /> Target language
        </Label>
        <Select value={targetLanguage} onValueChange={setTargetLanguage}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DUB_LANGUAGES.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span className="mr-2">{l.flag}</span>
                {l.label}{" "}
                <span className="text-muted-foreground">· {l.nativeLabel}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DubbingApiSettings
        models={apiModels}
        useVoiceClone={useVoiceClone}
        onApiChange={(patch) => setApiModels((prev) => ({ ...prev, ...patch }))}
        onChangeCloneVoice={setUseVoiceClone}
      />

      <div className="space-y-1.5">
        <Label>Original audio behind the new voice</Label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={backgroundGain}
            onChange={(e) => setBackgroundGain(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(backgroundGain * 100)}%
          </span>
        </div>
        <p className="text-2xs text-muted-foreground">
          0% = clean dub (cinema style) · 15% = documentary style · higher values keep more
          music and ambience.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dub-tone">Voice tone / style</Label>
        <Input
          id="dub-tone"
          value={voiceTone}
          onChange={(e) => setVoiceTone(e.target.value)}
          placeholder="natural, energetic, calm…"
          maxLength={60}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push("/")}>
          Cancel
        </Button>
        <Button disabled={!canSubmit} onClick={submit}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
            </>
          ) : (
            <>Create dubbing project</>
          )}
        </Button>
      </div>
    </div>
  );
}
