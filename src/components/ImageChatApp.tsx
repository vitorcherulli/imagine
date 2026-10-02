"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  Download,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { ImageChat, ImageChatMessage } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { VariationModelSelect } from "@/components/VariationModelSelect";
import { AddToCreativesButton } from "@/components/creatives/AddToCreatives";
import { shrinkImageFile } from "@/lib/social-art/shrink-image";
import { IMAGE_CHAT_MAX_ATTACHMENTS, parseImageChatUrls } from "@/lib/image-chat";
import { isModelId } from "@/lib/model-catalog";
import { VARIATION_ASPECTS, type VariationAspect } from "@/lib/variations";
import { cn } from "@/lib/utils";

const POLL_MS = 2500;
const MODEL_KEY = "imagine:image-chat:model";
const ASPECT_KEY = "imagine:image-chat:aspect";
const SHRINK_ABOVE_BYTES = 4 * 1024 * 1024;

const SUGGESTIONS = [
  "Um anúncio de SaaS com uma mulher sorrindo segurando um notebook, fundo azul tecnológico",
  "Foto de produto: frasco de perfume dourado sobre mármore, luz suave de estúdio",
  "Ilustração 3D fofa de um robô atendendo clientes no WhatsApp",
  "Post para Instagram: 'Black Friday — até 70% OFF' com tipografia ousada",
];

const ASPECT_CLASS: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
};

type Attachment = { key: string; url: string; file?: File };

function isBusy(messages: ImageChatMessage[]): boolean {
  return messages.some((m) => m.status === "thinking" || m.status === "generating");
}

function relativeDay(value: Date | string): string {
  const d = new Date(value);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}

export function ImageChatApp({
  initialChats,
  initialChat,
  initialMessages,
  defaultImageModel,
}: {
  initialChats: ImageChat[];
  initialChat: ImageChat | null;
  initialMessages: ImageChatMessage[];
  defaultImageModel: string;
}) {
  const { toast } = useToast();
  const [chats, setChats] = React.useState(initialChats);
  const [chat, setChat] = React.useState<ImageChat | null>(initialChat);
  const [messages, setMessages] = React.useState(initialMessages);
  const [draftModel, setDraftModel] = React.useState(defaultImageModel);
  const [draftAspect, setDraftAspect] = React.useState<VariationAspect>("1:1");
  const [text, setText] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [sending, setSending] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const model = chat ? (isModelId(chat.imageModel) ? chat.imageModel : draftModel) : draftModel;
  const aspect = (chat?.aspectRatio ?? draftAspect) as VariationAspect;
  const busy = isBusy(messages);

  React.useEffect(() => {
    const m = window.localStorage.getItem(MODEL_KEY);
    if (isModelId(m)) setDraftModel(m);
    const a = window.localStorage.getItem(ASPECT_KEY);
    if (a && (VARIATION_ASPECTS as readonly string[]).includes(a)) setDraftAspect(a as VariationAspect);
  }, []);

  const fail = React.useCallback(
    (title: string, err: unknown) =>
      toast({ title, description: err instanceof Error ? err.message : String(err), variant: "destructive" }),
    [toast],
  );

  const loadChat = React.useCallback(async (id: string) => {
    const res = await fetch(`/api/image-chats/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { chat: ImageChat; messages: ImageChatMessage[] };
    setChat(data.chat);
    setMessages(data.messages);
    setChats((prev) => {
      const rest = prev.filter((c) => c.id !== data.chat.id);
      return [data.chat, ...rest].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    });
    return data;
  }, []);

  React.useEffect(() => {
    if (!chat || !busy) return;
    const t = window.setInterval(() => void loadChat(chat.id).catch(() => {}), POLL_MS);
    return () => window.clearInterval(t);
  }, [chat, busy, loadChat]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.status]);

  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  function setUrl(id: string | null) {
    window.history.replaceState(null, "", id ? `/image-chat/${id}` : "/image-chat");
  }

  function newChat() {
    setChat(null);
    setMessages([]);
    setAttachments([]);
    setText("");
    setUrl(null);
    inputRef.current?.focus();
  }

  async function openChat(id: string) {
    if (chat?.id === id) return;
    try {
      await loadChat(id);
      setAttachments([]);
      setUrl(id);
    } catch (err) {
      fail("Could not open chat", err);
    }
  }

  async function deleteChat(id: string) {
    if (!window.confirm("Delete this chat and its images?")) return;
    try {
      const res = await fetch(`/api/image-chats/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (chat?.id === id) newChat();
    } catch (err) {
      fail("Could not delete", err);
    }
  }

  async function patchChat(patch: Partial<Pick<ImageChat, "title" | "imageModel" | "aspectRatio">>) {
    if (!chat) return;
    setChat({ ...chat, ...patch });
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, ...patch } : c)));
    try {
      const res = await fetch(`/api/image-chats/${chat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      fail("Could not save", err);
    }
  }

  function changeModel(next: string) {
    window.localStorage.setItem(MODEL_KEY, next);
    setDraftModel(next);
    if (chat) void patchChat({ imageModel: next });
  }

  function changeAspect(next: VariationAspect) {
    window.localStorage.setItem(ASPECT_KEY, next);
    setDraftAspect(next);
    if (chat) void patchChat({ aspectRatio: next });
  }

  function addFiles(list: FileList | File[] | null | undefined) {
    if (!list) return;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setAttachments((prev) =>
      [...prev, ...files.map((file) => ({ key: `${file.name}-${Math.random()}`, url: URL.createObjectURL(file), file }))].slice(
        0,
        IMAGE_CHAT_MAX_ATTACHMENTS,
      ),
    );
  }

  function addReference(url: string) {
    setAttachments((prev) =>
      prev.some((a) => a.url === url) ? prev : [...prev, { key: url, url }].slice(0, IMAGE_CHAT_MAX_ATTACHMENTS),
    );
    inputRef.current?.focus();
  }

  async function send(overrideText?: string) {
    const body = (overrideText ?? text).trim();
    if ((!body && attachments.length === 0) || sending || busy) return;
    setSending(true);
    try {
      let target = chat;
      if (!target) {
        const res = await fetch("/api/image-chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageModel: draftModel, aspectRatio: draftAspect }),
        });
        const data = (await res.json().catch(() => ({}))) as { chat?: ImageChat; error?: string };
        if (!res.ok || !data.chat) throw new Error(data.error || `HTTP ${res.status}`);
        target = data.chat;
        setChat(target);
        setChats((prev) => [target!, ...prev]);
        setUrl(target.id);
      }
      const fd = new FormData();
      fd.set("text", body);
      for (const a of attachments) {
        if (a.file) {
          fd.append("images", a.file.size > SHRINK_ABOVE_BYTES ? await shrinkImageFile(a.file, 2400, 0.9) : a.file);
        } else {
          fd.append("refUrls", a.url);
        }
      }
      const res = await fetch(`/api/image-chats/${target.id}/messages`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setText("");
      setAttachments([]);
      await loadChat(target.id);
    } catch (err) {
      fail("Could not send", err);
    } finally {
      setSending(false);
    }
  }

  async function retry(messageId: string) {
    if (!chat) return;
    try {
      const res = await fetch(`/api/image-chats/${chat.id}/messages/${messageId}/retry`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await loadChat(chat.id);
    } catch (err) {
      fail("Could not retry", err);
    }
  }

  const generated = React.useMemo(
    () =>
      messages
        .filter((m) => m.role === "assistant")
        .flatMap((m) =>
          parseImageChatUrls(m.imageUrls).map((url, index) => ({ url, index, messageId: m.id, prompt: m.prompt })),
        )
        .reverse(),
    [messages],
  );

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-panel">
        <div className="p-2">
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={newChat}>
            <MessageSquarePlus className="h-3.5 w-3.5" /> New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-1.5 pb-2">
          {chats.length === 0 ? (
            <p className="px-2 py-4 text-2xs text-muted-foreground">Your chats will appear here.</p>
          ) : null}
          {chats.map((c, i) => {
            const showDay = i === 0 || relativeDay(chats[i - 1].updatedAt) !== relativeDay(c.updatedAt);
            return (
              <React.Fragment key={c.id}>
                {showDay ? (
                  <div className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {relativeDay(c.updatedAt)}
                  </div>
                ) : null}
                <div
                  className={cn(
                    "group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-muted",
                    chat?.id === c.id && "bg-muted font-medium",
                  )}
                  onClick={() => void openChat(c.id)}
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <button
                    type="button"
                    className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteChat(c.id);
                    }}
                    title="Delete chat"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </aside>

      <section
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        {dragging ? (
          <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent">
            Drop images to use as reference
          </div>
        ) : null}

        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
          {chat ? (
            <input
              key={chat.id}
              defaultValue={chat.title}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t && t !== chat.title) void patchChat({ title: t });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="min-w-0 flex-1 rounded bg-transparent px-1 text-sm font-semibold outline-none hover:bg-muted focus:bg-muted"
              maxLength={80}
            />
          ) : (
            <span className="text-sm font-semibold">Image chat</span>
          )}
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <Sparkles className="h-8 w-8 text-accent" />
                <div>
                  <h2 className="text-lg font-semibold">What do you want to create?</h2>
                  <p className="text-xs text-muted-foreground">
                    Describe an image, attach references, then ask for changes — like ChatGPT.
                  </p>
                </div>
                <div className="grid w-full gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-lg border border-border bg-panel px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} message={m} onOpen={setLightbox} />
              ) : (
                <AssistantBubble
                  key={m.id}
                  message={m}
                  aspect={aspect}
                  onOpen={setLightbox}
                  onRetry={() => void retry(m.id)}
                  onEdit={addReference}
                  chatTitle={chat?.title ?? ""}
                  disabled={busy}
                />
              ),
            )}
          </div>
        </div>

        <div className="shrink-0 px-4 pb-4">
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-background p-2 shadow-sm focus-within:border-accent/60">
            {attachments.length ? (
              <div className="mb-2 flex flex-wrap gap-2 px-1">
                {attachments.map((a) => (
                  <div key={a.key} className="relative h-14 w-14 overflow-hidden rounded-md border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((p) => p.key !== a.key))}
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                      title="Remove"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.length) {
                  e.preventDefault();
                  addFiles(files);
                }
              }}
              rows={1}
              placeholder={chat ? "Ask for a change or a new image…" : "Describe the image you want…"}
              className="block max-h-[200px] w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
            />
            <div className="mt-1 flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileRef.current?.click()}
                title="Attach reference images"
                disabled={attachments.length >= IMAGE_CHAT_MAX_ATTACHMENTS}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="w-52 min-w-0">
                <VariationModelSelect
                  kind="image"
                  label="Image AI"
                  value={model}
                  onChange={changeModel}
                  usage="all"
                  placement="top"
                  compact
                />
              </div>
              <div className="flex rounded-md bg-muted p-0.5">
                {VARIATION_ASPECTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => changeAspect(a)}
                    className={cn(
                      "rounded-sm px-1.5 py-0.5 text-2xs font-medium",
                      aspect === a ? "bg-background shadow" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <Button
                variant="primary"
                size="icon"
                className="ml-auto rounded-full"
                disabled={sending || busy || (!text.trim() && attachments.length === 0)}
                onClick={() => void send()}
                title="Send (Enter)"
              >
                {sending || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <p className="mx-auto mt-1 max-w-3xl text-center text-[10px] text-muted-foreground">
            Enter to send · Shift+Enter for a new line · drop or paste images to use as reference
          </p>
        </div>
      </section>

      <aside className="hidden w-64 shrink-0 flex-col border-l border-border bg-panel lg:flex">
        <div className="flex h-11 items-center border-b border-border px-3 text-xs font-semibold">
          Generated images {generated.length ? `(${generated.length})` : ""}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {generated.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-2xs text-muted-foreground">
              <ImagePlus className="h-5 w-5" />
              Images from this chat show up here.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {generated.map((g) => (
                <div key={g.url} className="group relative overflow-hidden rounded-md border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.url}
                    alt={g.prompt ?? ""}
                    title={g.prompt ?? ""}
                    className="aspect-square w-full cursor-zoom-in object-cover"
                    onClick={() => {
                      document.getElementById(`msg-${g.messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      setLightbox(g.url);
                    }}
                  />
                  <div className="absolute inset-x-0 bottom-0 hidden justify-end gap-1 bg-gradient-to-t from-black/70 p-1 group-hover:flex">
                    <AddToCreativesButton
                      source={{ type: "image-chat", id: `${g.messageId}:${g.index}`, isVideo: false }}
                      name={chat?.title}
                      iconOnly
                      variant="ghost"
                      className="h-5 w-5 rounded bg-white/90 text-black hover:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => addReference(g.url)}
                      className="rounded bg-white/90 p-1 text-black"
                      title="Edit this image"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <a href={g.url} download className="rounded bg-white/90 p-1 text-black" title="Download">
                      <Download className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
          <a
            href={lightbox}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute right-6 top-6 flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-black"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        </div>
      ) : null}
    </div>
  );
}

function UserBubble({ message, onOpen }: { message: ImageChatMessage; onOpen: (url: string) => void }) {
  const urls = parseImageChatUrls(message.imageUrls);
  return (
    <div id={`msg-${message.id}`} className="flex flex-col items-end gap-1.5">
      {urls.length ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {urls.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={u}
              src={u}
              alt="Reference"
              onClick={() => onOpen(u)}
              className="h-20 w-20 cursor-zoom-in rounded-lg border border-border object-cover"
            />
          ))}
        </div>
      ) : null}
      {message.content ? (
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-muted px-3.5 py-2 text-sm">{message.content}</div>
      ) : null}
    </div>
  );
}

function AssistantBubble({
  message,
  aspect,
  onOpen,
  onRetry,
  onEdit,
  chatTitle,
  disabled,
}: {
  message: ImageChatMessage;
  aspect: string;
  onOpen: (url: string) => void;
  onRetry: () => void;
  onEdit: (url: string) => void;
  chatTitle: string;
  disabled: boolean;
}) {
  const urls = parseImageChatUrls(message.imageUrls);
  return (
    <div id={`msg-${message.id}`} className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        {message.status === "thinking" ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </p>
        ) : null}
        {message.content ? <p className="whitespace-pre-wrap text-sm">{message.content}</p> : null}

        {message.status === "generating" ? (
          <div
            className={cn(
              "flex w-full max-w-md animate-pulse flex-col items-center justify-center gap-2 rounded-xl bg-muted text-2xs text-muted-foreground",
              ASPECT_CLASS[aspect] ?? "aspect-square",
            )}
          >
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            Creating image…
          </div>
        ) : null}

        {urls.map((u, i) => (
          <div key={u} className="group relative w-fit max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u}
              alt={message.prompt ?? "Generated image"}
              onClick={() => onOpen(u)}
              className="max-h-[480px] cursor-zoom-in rounded-xl border border-border object-contain"
            />
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <AddToCreativesButton
                source={{ type: "image-chat", id: `${message.id}:${i}`, isVideo: false }}
                name={chatTitle}
                label="Creatives"
                variant="outline"
              />
              <Button variant="ghost" size="xs" onClick={() => onEdit(u)} title="Use this image as the base for the next message">
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button variant="ghost" size="xs" asChild>
                <a href={u} download>
                  <Download className="h-3 w-3" /> Download
                </a>
              </Button>
              <Button variant="ghost" size="xs" onClick={onRetry} disabled={disabled} title="Generate again">
                <RotateCcw className="h-3 w-3" /> Again
              </Button>
              <Link
                href="/gallery"
                className="ml-1 flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
                title="Saved automatically in Gallery › Geradas por IA › Image chat"
              >
                <Check className="h-3 w-3 text-emerald-500" /> In Gallery
              </Link>
            </div>
          </div>
        ))}

        {message.status === "error" ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1 text-muted-foreground">{message.error || "Something went wrong."}</span>
            <Button variant="outline" size="xs" onClick={onRetry} disabled={disabled}>
              <RotateCcw className="h-3 w-3" /> Try again
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
