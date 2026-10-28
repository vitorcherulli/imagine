"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { ArrowLeft, Download, Loader2, MessageSquareText, Play, Send, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { getMotionComponent, durationInFramesFor } from "@/remotion/registry";
import { getMotionTemplate } from "@/lib/motion/templates";
import { DEFAULT_MOTION_PROPS, type MotionField, type MotionProps } from "@/lib/motion/types";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const GROUP_ORDER = ["Texto", "Marca", "Cores", "Ritmo"] as const;

export function MotionEditor({ designId }: { designId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [templateId, setTemplateId] = useState("bold-intro");
  const [title, setTitle] = useState("Peça de motion");
  const [props, setProps] = useState<MotionProps>(DEFAULT_MOTION_PROPS);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("design");
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const template = useMemo(() => getMotionTemplate(templateId), [templateId]);
  const Component = useMemo(() => getMotionComponent(templateId), [templateId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/motion/${designId}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json.error ?? "Falha ao carregar");
        setTemplateId(json.design.templateId);
        setTitle(json.design.title);
        setProps({ ...DEFAULT_MOTION_PROPS, ...json.design.props });
        setMessages(json.design.messages ?? []);
        setOutputUrl(json.design.outputUrl ?? null);
      } catch (err) {
        toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [designId, toast]);

  // Auto-save (debounce) sempre que props/título mudam.
  useEffect(() => {
    if (loading || !dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/motion/${designId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, props }),
        });
        setDirty(false);
      } catch {
        /* silencioso */
      }
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [props, title, dirty, loading, designId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatBusy]);

  const setProp = useCallback(<K extends keyof MotionProps>(key: K, value: MotionProps[K]) => {
    setProps((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const sendChat = useCallback(async () => {
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatInput("");
    setChatBusy(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: message }]);
    try {
      const res = await fetch(`/api/motion/${designId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Não consegui editar");
      setProps(json.props);
      setMessages(json.messages ?? []);
    } catch (err) {
      toast({ title: "Erro no chat", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setMessages((m) => m.slice(0, -1));
    } finally {
      setChatBusy(false);
    }
  }, [chatInput, chatBusy, designId, toast]);

  const exportVideo = useCallback(async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const res = await fetch(`/api/motion/${designId}/render`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao renderizar");
      setOutputUrl(json.outputUrl);
      toast({ title: "Vídeo pronto!", description: "Sua peça foi exportada." });
    } catch (err) {
      toast({ title: "Erro ao exportar", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy, designId, toast]);

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando editor…
      </div>
    );
  }

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    fields: template.fields.filter((f) => f.group === g),
  })).filter((x) => x.fields.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <a href="/motion" title="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </a>
        </Button>
        <div className="min-w-0 flex-1">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="h-8 max-w-md border-transparent bg-transparent px-1 text-base font-semibold hover:border-input focus-visible:border-input"
          />
          <div className="px-1 text-xs text-muted-foreground">
            {template.name} · {dirty ? "salvando…" : "salvo"}
          </div>
        </div>
        {outputUrl ? (
          <Button variant="outline" asChild>
            <a href={outputUrl} download target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" /> Baixar MP4
            </a>
          </Button>
        ) : null}
        <Button onClick={exportVideo} disabled={exportBusy}>
          {exportBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {exportBusy ? "Renderizando…" : "Exportar MP4"}
        </Button>
      </div>

      {/* Body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[380px_1fr]">
        {/* Painel esquerdo */}
        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-3 mt-3 grid w-auto grid-cols-2">
              <TabsTrigger value="design">
                <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Personalizar
              </TabsTrigger>
              <TabsTrigger value="chat">
                <MessageSquareText className="mr-1.5 h-3.5 w-3.5" /> Chat
              </TabsTrigger>
            </TabsList>

            {/* Controles */}
            <TabsContent value="design" className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-3">
              <div className="space-y-5">
                {grouped.map((g) => (
                  <div key={g.group}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.group}
                    </div>
                    <div className="space-y-3">
                      {g.fields.map((f) => (
                        <FieldInput key={String(f.key)} field={f} value={props} onChange={setProp} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Chat */}
            <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
                {messages.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Peça alterações em linguagem natural. Ex.:
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                      <li>“deixa o título mais agressivo sobre oportunidade”</li>
                      <li>“troca as cores para azul e branco”</li>
                      <li>“coloca o CTA como QUERO COMEÇAR”</li>
                    </ul>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                        m.role === "user"
                          ? "ml-auto bg-accent text-accent-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {m.content}
                    </div>
                  ))
                )}
                {chatBusy ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando…
                  </div>
                ) : null}
                <div ref={chatEndRef} />
              </div>
              <div className="flex items-end gap-2 border-t border-border p-3">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendChat();
                    }
                  }}
                  placeholder="Descreva a mudança…"
                  rows={2}
                  className="min-h-[44px] resize-none"
                />
                <Button onClick={sendChat} disabled={chatBusy || !chatInput.trim()} size="icon" className="h-[44px] w-[44px]">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Preview */}
        <div className="flex min-h-0 flex-col items-center justify-center rounded-lg border border-border bg-black/40 p-4">
          <div className="flex h-full w-full items-center justify-center">
            <div
              className="overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10"
              style={{ height: "min(72vh, 100%)", aspectRatio: `${template.width} / ${template.height}` }}
            >
              <Player
                component={Component as unknown as React.ComponentType<Record<string, unknown>>}
                inputProps={props}
                durationInFrames={durationInFramesFor(props, template.fps)}
                fps={template.fps}
                compositionWidth={template.width}
                compositionHeight={template.height}
                style={{ width: "100%", height: "100%" }}
                controls
                loop
                clickToPlay
                doubleClickToFullscreen
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Play className="h-3.5 w-3.5" /> Preview ao vivo · {template.width}×{template.height}
            {outputUrl ? (
              <a href={outputUrl} target="_blank" rel="noreferrer" className="ml-2 text-accent underline">
                ver exportado
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: MotionField;
  value: MotionProps;
  onChange: <K extends keyof MotionProps>(key: K, v: MotionProps[K]) => void;
}) {
  const key = field.key;

  if (field.kind === "color") {
    const hex = String(value[key] ?? "#000000");
    return (
      <div>
        <Label className="text-xs">{field.label}</Label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000"}
            onChange={(e) => onChange(key, e.target.value as never)}
            className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-1"
          />
          <Input value={hex} onChange={(e) => onChange(key, e.target.value as never)} className="h-9 font-mono text-xs" />
        </div>
      </div>
    );
  }

  if (field.kind === "number") {
    const num = Number(value[key] ?? 0);
    return (
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">{field.label}</Label>
          <span className="text-xs tabular-nums text-muted-foreground">{num}s</span>
        </div>
        <Slider
          className="mt-2"
          value={[num]}
          min={field.min ?? 0}
          max={field.max ?? 100}
          step={field.step ?? 1}
          onValueChange={(v) => onChange(key, v[0] as never)}
        />
      </div>
    );
  }

  if (field.kind === "textarea") {
    return (
      <div>
        <Label className="text-xs">
          {field.label}
          {field.help ? <span className="ml-1 font-normal text-muted-foreground">({field.help})</span> : null}
        </Label>
        <Textarea
          value={String(value[key] ?? "")}
          onChange={(e) => onChange(key, e.target.value as never)}
          rows={2}
          className="mt-1 text-sm"
        />
      </div>
    );
  }

  return (
    <div>
      <Label className="text-xs">
        {field.label}
        {field.help ? <span className="ml-1 font-normal text-muted-foreground">({field.help})</span> : null}
      </Label>
      <Input
        value={String(value[key] ?? "")}
        onChange={(e) => onChange(key, e.target.value as never)}
        className="mt-1 h-9 text-sm"
      />
    </div>
  );
}
