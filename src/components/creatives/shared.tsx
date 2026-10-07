import type { Creative } from "@/lib/db/schema";
import type { CreativeLibrary } from "@/lib/creatives-server";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  CREATIVE_STATUSES,
  buildAdName,
  buildCreativeName,
  isCreativeStatus,
  isCreativeUsage,
  type CreativeFormat,
  type CreativeStatus,
  type CreativeUsage,
  type PerformanceTrend,
} from "@/lib/creatives";

export type { CreativeLibrary };

export type Concept = {
  code: number;
  product: string;
  angle: string;
  hook: string;
  notes: string;
  format: CreativeFormat;
  creator: string;
  manualStatus: CreativeStatus | null;
  usage: CreativeUsage;
  /** When the concept went to the trash; null = live. */
  trashedAt: string | null;
  files: Creative[];
  versions: { version: number; files: Creative[] }[];
};

export const STATUS_VARIANT: Record<CreativeStatus, NonNullable<BadgeProps["variant"]>> = {
  winner: "success",
  validated: "accent",
  testing: "warning",
  pause: "destructive",
  untested: "outline",
  archived: "default",
};

export const RATIO_ORDER = ["9x16", "4x5", "1x1", "2x3", "16x9"];

export function groupConcepts(creatives: Creative[]): Concept[] {
  const byCode = new Map<number, Creative[]>();
  for (const c of creatives) byCode.set(c.code, [...(byCode.get(c.code) ?? []), c]);
  return [...byCode.entries()]
    .sort(([a], [b]) => b - a)
    .map(([code, files]) => {
      const head = [...files].sort((a, b) => a.version - b.version)[0];
      const versions = new Map<number, Creative[]>();
      for (const f of files) versions.set(f.version, [...(versions.get(f.version) ?? []), f]);
      const manual = files.find((f) => isCreativeStatus(f.status))?.status;
      const usage = files.find((f) => isCreativeUsage(f.usage))?.usage;
      const trashed = files.find((f) => f.trashedAt)?.trashedAt;
      return {
        code,
        product: head.product,
        angle: head.angle,
        hook: files.find((f) => f.hook)?.hook ?? "",
        notes: files.find((f) => f.notes)?.notes ?? "",
        format: head.format as CreativeFormat,
        creator: head.creator,
        manualStatus: isCreativeStatus(manual) ? manual : null,
        usage: isCreativeUsage(usage) ? usage : "unused",
        trashedAt: trashed ? new Date(trashed).toISOString() : null,
        files,
        versions: [...versions.entries()]
          .sort(([a], [b]) => b - a)
          .map(([version, vf]) => ({
            version,
            files: vf.sort((a, b) => RATIO_ORDER.indexOf(a.aspectRatio) - RATIO_ORDER.indexOf(b.aspectRatio)),
          })),
      };
    });
}

export function nameOf(c: Creative): string {
  return buildCreativeName({ ...c, format: c.format as CreativeFormat });
}

export function adNameOf(c: Creative): string {
  return buildAdName({ ...c, format: c.format as CreativeFormat });
}

/** Sizes missing from the latest version — the one that should be live. */
export function conceptGaps(c: Concept): { feed: boolean; story: boolean } {
  const ratios = new Set(c.versions[0]?.files.map((f) => f.aspectRatio));
  return { feed: !ratios.has("4x5") && !ratios.has("1x1"), story: !ratios.has("9x16") };
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtInt(n: number | null | undefined): string {
  return n == null ? "—" : Math.round(n).toLocaleString();
}

export function fmtPct(n: number | null | undefined): string {
  return n == null ? "—" : `${n.toFixed(2)}%`;
}

export function fmtDuration(s: number | null | undefined): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}

export function StatusBadge({ status, suggested }: { status: CreativeStatus; suggested?: boolean }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} title={suggested ? "Suggested from metrics" : "Set manually"}>
      {CREATIVE_STATUSES[status]}
      {suggested ? <span className="opacity-60">·auto</span> : null}
    </Badge>
  );
}

export function fmtChange(n: number | null | undefined): string {
  return n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`;
}

/** Fatigue / improving vs the previous period, or the plain change in cost per result. */
export function TrendBadge({ trend }: { trend: PerformanceTrend }) {
  const title = `vs previous period — cost per result ${fmtChange(trend.cpaChange)}, CTR ${fmtChange(trend.ctrChange)}`;
  if (trend.fatigue) {
    return (
      <Badge variant="destructive" title={title}>
        Fatigue{trend.cpaChange != null ? ` ${fmtChange(trend.cpaChange)}` : ""}
      </Badge>
    );
  }
  if (trend.improving) {
    return (
      <Badge variant="success" title={title}>
        Improving {fmtChange(trend.cpaChange)}
      </Badge>
    );
  }
  return (
    <span className="text-2xs tabular-nums text-muted-foreground" title={title}>
      {fmtChange(trend.cpaChange)}
    </span>
  );
}

/** Pixel size (and duration for videos) read in the browser before upload. */
export function readLocalMediaSize(
  file: File,
): Promise<{ width: number; height: number; duration: number | null } | null> {
  const url = URL.createObjectURL(file);
  const done = <T,>(v: T) => {
    URL.revokeObjectURL(url);
    return v;
  };
  return new Promise((resolve) => {
    if (file.type.startsWith("video/") || /\.(mp4|mov)$/i.test(file.name)) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () =>
        resolve(done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration || null }));
      v.onerror = () => resolve(done(null));
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => resolve(done({ width: img.naturalWidth, height: img.naturalHeight, duration: null }));
      img.onerror = () => resolve(done(null));
      img.src = url;
    }
  });
}
