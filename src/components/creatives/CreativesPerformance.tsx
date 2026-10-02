"use client";

import * as React from "react";
import { FileSpreadsheet, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { SegmentedControl } from "@/components/social-art/SocialArtControls";
import { cn } from "@/lib/utils";
import {
  CREATIVE_FORMATS,
  creativeCode,
  periodLabel,
  summarizePerformance,
  type CreativeFormat,
  type CreativePerformance,
  type CreativeStatus,
  type PerformanceTrend,
} from "@/lib/creatives";
import {
  StatusBadge,
  TrendBadge,
  fmtInt,
  fmtMoney,
  fmtPct,
  type Concept,
  type CreativeLibrary,
} from "@/components/creatives/shared";

type Breakdown = "product" | "format" | "creator";

const HISTORY_PERIODS = 6;

export function CreativesPerformance({
  library,
  concepts,
  statusOf,
  trendOf,
  minSpend,
  onMinSpendChange,
  onPeriodChange,
  onChanged,
}: {
  library: CreativeLibrary;
  concepts: Concept[];
  statusOf: (c: Concept) => { status: CreativeStatus; suggested: boolean };
  trendOf: (c: Concept) => PerformanceTrend | null;
  minSpend: number;
  onMinSpendChange: (n: number) => void;
  onPeriodChange: (id: string | null) => void;
  /** `newest` after an import, so the view jumps to the latest period. */
  onChanged: (newest?: boolean) => void;
}) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [breakdown, setBreakdown] = React.useState<Breakdown>("product");
  const perf = library.performance;

  async function importCsv(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/creatives/metrics", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        rows?: number;
        matched?: number;
        periodStart?: string | null;
        periodEnd?: string | null;
        replaced?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const label = periodLabel({
        periodStart: data.periodStart ?? null,
        periodEnd: data.periodEnd ?? null,
        importedAt: new Date().toISOString(),
      });
      toast({
        title: data.replaced ? `${label} updated` : `${label} added`,
        description: `${data.rows} ads · ${data.matched} matched a creative code${
          data.periodStart ? "" : " · add the “Reporting starts/ends” columns to label the period by date"
        }`,
      });
      onChanged(true);
    } catch (err) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function removePeriod(id: string, label: string) {
    if (!window.confirm(`Delete the results of ${label}?`)) return;
    setBusy(true);
    await fetch(`/api/creatives/metrics?import=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    setBusy(false);
    onChanged(true);
  }

  const periods = library.periods;
  const current = periods.find((p) => p.id === library.metrics.periodId) ?? null;
  const history = periods.slice(0, HISTORY_PERIODS).reverse();

  const ranked = concepts
    .filter((c) => perf[c.code])
    .sort((a, b) => {
      const pa = perf[a.code]!;
      const pb = perf[b.code]!;
      if (pa.cpa != null && pb.cpa != null) return pa.cpa - pb.cpa;
      if (pa.cpa != null) return -1;
      if (pb.cpa != null) return 1;
      return pb.spend - pa.spend;
    });

  const groups = new Map<string, { concepts: number; rows: CreativePerformance[] }>();
  for (const c of concepts) {
    const p = perf[c.code];
    if (!p) continue;
    const key =
      breakdown === "product"
        ? c.product
        : breakdown === "format"
          ? `${c.format} — ${CREATIVE_FORMATS[c.format as CreativeFormat] ?? ""}`
          : c.format === "UGC"
            ? c.creator || "(no creator)"
            : "(not UGC)";
    const g = groups.get(key) ?? { concepts: 0, rows: [] };
    g.concepts += 1;
    g.rows.push(p);
    groups.set(key, g);
  }
  const breakdownRows = [...groups.entries()]
    .map(([key, g]) => ({ key, concepts: g.concepts, p: summarizePerformance(g.rows) }))
    .sort((a, b) => b.p.spend - a.p.spend);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-lg border border-border bg-panel p-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <FileSpreadsheet className="h-4 w-4 text-accent" /> Meta Ads results
          </h3>
          {current ? (
            <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
              <span>Period</span>
              <select
                value={current.id}
                onChange={(e) => onPeriodChange(e.target.value === periods[0]?.id ? null : e.target.value)}
                className="h-7 rounded-md border border-input bg-background px-1.5 text-xs text-foreground"
              >
                {periods.map((p, i) => (
                  <option key={p.id} value={p.id}>
                    {periodLabel(p)}
                    {i === 0 ? " (latest)" : ""} · {p.rows} ads
                  </option>
                ))}
              </select>
              <span className="truncate">from {current.sourceFile}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removePeriod(current.id, periodLabel(current))}
                title="Delete this period"
                className="rounded p-1 hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <p className="text-2xs text-muted-foreground">No results imported yet.</p>
          )}
          <ol className="list-decimal space-y-0.5 pl-4 text-2xs text-muted-foreground">
            <li>
              In Ads Manager, open the <b>Ads</b> tab and pick one period (e.g. last 7 days). Import one export per
              period — each is kept, so you can compare and catch creatives that are wearing out.
            </li>
            <li>Make sure every ad name contains its creative code (e.g. C013).</li>
            <li>
              Columns: <i>Ad name, Amount spent, Impressions, Link clicks, Results</i>, plus{" "}
              <i>Reporting starts / ends</i> to label the period by date.
            </li>
            <li>Reports → Export table data → CSV, then import it here. Re-importing the same dates replaces that period.</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                void importCsv(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="min-spend">Minimum spend to judge a concept</Label>
          <Input
            id="min-spend"
            type="number"
            min={0}
            value={minSpend}
            onChange={(e) => onMinSpendChange(Math.max(0, Number(e.target.value) || 0))}
          />
          <p className="text-2xs text-muted-foreground">
            Below it a concept stays <b>Testing</b>. Above it, cost per result is compared with other concepts of the
            same product: ≥20% cheaper is a <b>Winner</b>, ≥50% more expensive (or no results) is <b>Pause</b>.
          </p>
        </div>
      </section>

      {ranked.length ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ranking</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-2xs text-muted-foreground">
                <tr>
                  <Th>Concept</Th>
                  <Th>Status</Th>
                  <Th right>Spend</Th>
                  <Th right>Results</Th>
                  <Th right>Cost / result</Th>
                  <Th right>CTR</Th>
                  <Th right>Ads</Th>
                  {periods.length > 1 ? <Th right>vs prev.</Th> : null}
                </tr>
              </thead>
              <tbody>
                {ranked.map((c) => {
                  const p = perf[c.code]!;
                  const s = statusOf(c);
                  const trend = trendOf(c);
                  return (
                    <tr key={c.code} className="border-t border-border">
                      <td className="px-2.5 py-1.5">
                        <span className="font-mono font-medium">{creativeCode(c.code)}</span>{" "}
                        <span className="text-muted-foreground">
                          {c.product} · {c.angle} · {c.format}
                          {c.creator ? `-${c.creator}` : ""}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5">
                        <StatusBadge status={s.status} suggested={s.suggested} />
                      </td>
                      <Td>{fmtMoney(p.spend)}</Td>
                      <Td>{fmtInt(p.results)}</Td>
                      <Td>{fmtMoney(p.cpa)}</Td>
                      <Td>{fmtPct(p.ctr)}</Td>
                      <Td>{p.ads}</Td>
                      {periods.length > 1 ? (
                        <td className="px-2.5 py-1.5 text-right">
                          {trend ? <TrendBadge trend={trend} /> : <span className="text-2xs text-muted-foreground">new</span>}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {history.length > 1 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cost per result over time
          </h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-2xs text-muted-foreground">
                <tr>
                  <Th>Concept</Th>
                  {history.map((p) => (
                    <th
                      key={p.id}
                      className={cn("px-2.5 py-1.5 text-right font-medium", p.id === current?.id && "text-foreground")}
                    >
                      {periodLabel(p)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {concepts
                  .filter((c) => history.some((p) => p.performance[c.code]))
                  .sort((a, b) => (perf[b.code]?.spend ?? 0) - (perf[a.code]?.spend ?? 0))
                  .map((c) => (
                    <tr key={c.code} className="border-t border-border">
                      <td className="px-2.5 py-1.5">
                        <span className="font-mono font-medium">{creativeCode(c.code)}</span>{" "}
                        <span className="text-muted-foreground">{c.angle}</span>
                      </td>
                      {history.map((p, i) => {
                        const cur = p.performance[c.code];
                        const prev = i > 0 ? history[i - 1].performance[c.code] : undefined;
                        const worse = cur?.cpa != null && prev?.cpa != null && cur.cpa >= prev.cpa * 1.3;
                        const better = cur?.cpa != null && prev?.cpa != null && cur.cpa <= prev.cpa * 0.8;
                        return (
                          <td
                            key={p.id}
                            title={cur ? `${fmtMoney(cur.spend)} spent · CTR ${fmtPct(cur.ctr)}` : "Not running"}
                            className={cn(
                              "px-2.5 py-1.5 text-right tabular-nums",
                              worse && "text-destructive",
                              better && "text-success",
                              !cur && "text-muted-foreground/50",
                            )}
                          >
                            {cur ? (cur.cpa != null ? fmtMoney(cur.cpa) : "no result") : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            Red: ≥30% more expensive than the period before. Green: ≥20% cheaper. Hover a cell for spend and CTR.
          </p>
        </section>
      ) : null}

      {breakdownRows.length ? (
        <section>
          <div className="mb-2 flex items-end justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What works</h3>
            <div className="w-64">
              <SegmentedControl<Breakdown>
                label="Group by"
                value={breakdown}
                onChange={setBreakdown}
                options={[
                  { value: "product", label: "Product" },
                  { value: "format", label: "Format" },
                  { value: "creator", label: "Creator" },
                ]}
              />
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-2xs text-muted-foreground">
                <tr>
                  <Th>Group</Th>
                  <Th right>Concepts</Th>
                  <Th right>Spend</Th>
                  <Th right>Results</Th>
                  <Th right>Cost / result</Th>
                  <Th right>CTR</Th>
                </tr>
              </thead>
              <tbody>
                {breakdownRows.map((r) => (
                  <tr key={r.key} className="border-t border-border">
                    <td className="px-2.5 py-1.5 font-medium">{r.key}</td>
                    <Td>{r.concepts}</Td>
                    <Td>{fmtMoney(r.p.spend)}</Td>
                    <Td>{fmtInt(r.p.results)}</Td>
                    <Td>{fmtMoney(r.p.cpa)}</Td>
                    <Td>{fmtPct(r.p.ctr)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {library.metrics.unmatched.length ? (
        <section className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <h3 className="text-xs font-semibold">Ads without a known creative code</h3>
          <p className="mb-1.5 text-2xs text-muted-foreground">
            Rename these ads in Meta to include the code (copy it from the Library) so their results count.
          </p>
          <ul className="max-h-40 space-y-0.5 overflow-auto font-mono text-2xs">
            {library.metrics.unmatched.map((n, i) => (
              <li key={`${n}-${i}`} className="truncate">
                {n}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("px-2.5 py-1.5 font-medium", right ? "text-right" : "text-left")}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2.5 py-1.5 text-right tabular-nums">{children}</td>;
}
