"use client";

import * as React from "react";
import { Check, Copy, Link2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { creativeCode } from "@/lib/creatives";

export type ShareTarget = { scope: "all" | "folder" | "concept"; value: string; label: string };

type ShareRow = {
  id: string;
  token: string;
  scope: ShareTarget["scope"];
  scopeValue: string;
  expiresAt: string | null;
  views: number;
  lastViewedAt: string | null;
  createdAt: string;
};

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "", label: "No expiry" },
];

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function scopeLabel(s: Pick<ShareRow, "scope" | "scopeValue">): string {
  if (s.scope === "all") return "Whole library";
  if (s.scope === "folder") return `Folder ${s.scopeValue}`;
  return `Concept ${creativeCode(Number(s.scopeValue))}`;
}

export function ShareDialog({ target, onClose }: { target: ShareTarget | null; onClose: () => void }) {
  const { toast } = useToast();
  const [shares, setShares] = React.useState<ShareRow[] | null>(null);
  const [expiry, setExpiry] = React.useState("30");
  const [busy, setBusy] = React.useState(false);
  const [createdToken, setCreatedToken] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/creatives/shares", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { shares?: ShareRow[] };
    setShares(data.shares ?? []);
  }, []);

  React.useEffect(() => {
    if (!target) return;
    setCreatedToken(null);
    setShares(null);
    void load();
  }, [target, load]);

  const urlOf = (token: string) => `${window.location.origin}/share/${token}`;

  function copy(token: string) {
    void navigator.clipboard.writeText(urlOf(token));
    setCopied(token);
    window.setTimeout(() => setCopied((c) => (c === token ? null : c)), 1500);
  }

  async function create() {
    if (!target) return;
    setBusy(true);
    try {
      const res = await fetch("/api/creatives/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: target.scope, value: target.value, expiresInDays: expiry ? Number(expiry) : null }),
      });
      const data = (await res.json().catch(() => ({}))) as { share?: ShareRow; error?: string };
      if (!res.ok || !data.share) throw new Error(data.error || `HTTP ${res.status}`);
      setCreatedToken(data.share.token);
      copy(data.share.token);
      toast({ title: "Link created and copied", description: "Send it to whoever needs the files." });
      await load();
    } catch (e) {
      toast({ title: "Could not create the link", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(s: ShareRow) {
    if (!window.confirm(`Revoke this link to ${scopeLabel(s)}? Anyone using it loses access right away.`)) return;
    await fetch(`/api/creatives/shares/${s.id}`, { method: "DELETE" }).catch(() => undefined);
    if (createdToken === s.token) setCreatedToken(null);
    await load();
  }

  const sorted = (shares ?? []).slice().sort((a, b) => {
    const mine = (s: ShareRow) => (target && s.scope === target.scope && s.scopeValue === target.value ? 0 : 1);
    return mine(a) - mine(b);
  });

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Link2 className="h-4 w-4 text-accent" /> Share {target?.label}
          </DialogTitle>
          <DialogDescription>
            Anyone with the link can view and download these creatives without logging in — handy for designers,
            editors and agencies. Results, notes and status stay private, and archived concepts are left out. Revoke
            the link at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5">
          <span className="text-xs text-muted-foreground">Link valid for</span>
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" className="ml-auto" disabled={busy} onClick={() => void create()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Create link
          </Button>
          {createdToken ? (
            <div className="flex w-full items-center gap-1.5">
              <input
                readOnly
                value={urlOf(createdToken)}
                onFocus={(e) => e.target.select()}
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-2xs"
              />
              <Button size="sm" onClick={() => copy(createdToken)}>
                {copied === createdToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Links</p>
          {shares === null ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading…
            </p>
          ) : !sorted.length ? (
            <p className="py-3 text-center text-xs text-muted-foreground">No links yet.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-auto rounded-md border border-border">
              {sorted.map((s) => {
                const expired = !!s.expiresAt && new Date(s.expiresAt).getTime() < Date.now();
                return (
                  <li key={s.id} className={cn("flex items-center gap-2 px-2.5 py-1.5 text-xs", expired && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{scopeLabel(s)}</p>
                      <p className="truncate text-2xs text-muted-foreground">
                        Created {day(s.createdAt)} ·{" "}
                        {expired ? "expired" : s.expiresAt ? `until ${day(s.expiresAt)}` : "no expiry"} · {s.views} view
                        {s.views === 1 ? "" : "s"}
                        {s.lastViewedAt ? ` · last opened ${day(s.lastViewedAt)}` : ""}
                      </p>
                    </div>
                    {!expired ? (
                      <Button size="xs" onClick={() => copy(s.token)} title="Copy link">
                        {copied === s.token ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    ) : null}
                    <Button size="xs" variant="ghost" onClick={() => void revoke(s)} title={expired ? "Delete" : "Revoke"}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
