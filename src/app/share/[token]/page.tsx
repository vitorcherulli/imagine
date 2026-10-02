import type { Metadata } from "next";
import { Download, Megaphone } from "lucide-react";
import { creativeCode } from "@/lib/creatives";
import { recordShareView, resolveShare, sharedCreatives } from "@/lib/creatives-share";
import { adNameOf, fmtDuration, groupConcepts, type Concept } from "@/components/creatives/shared";
import { CopyText } from "./CopyText";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared creatives",
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: { token: string } }) {
  const share = await resolveShare(params.token);
  if (!share) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <Megaphone className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <h1 className="text-sm font-semibold">This link is no longer available</h1>
          <p className="mt-1 text-xs text-muted-foreground">It expired or was revoked. Ask for a new one.</p>
        </div>
      </main>
    );
  }
  await recordShareView(share.id);

  const concepts = groupConcepts(await sharedCreatives(share));
  const base = `/api/share/${params.token}`;
  const title =
    share.scope === "concept" && concepts[0]
      ? `${creativeCode(concepts[0].code)} · ${concepts[0].angle}`
      : share.scope === "folder"
        ? share.scopeValue
        : "Creatives";
  const byFolder = new Map<string, Concept[]>();
  for (const c of concepts) byFolder.set(c.product, [...(byFolder.get(c.product) ?? []), c]);
  const folders = [...byFolder.keys()].sort();

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-5 py-6">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
        <div>
          <p className="flex items-center gap-1 text-2xs uppercase tracking-wide text-muted-foreground">
            <Megaphone className="h-3 w-3" /> Shared creatives
          </p>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-2xs text-muted-foreground">
            {concepts.length} concept{concepts.length === 1 ? "" : "s"} · read-only
            {share.expiresAt
              ? ` · available until ${new Date(share.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : ""}
          </p>
        </div>
        <p className="max-w-sm text-2xs text-muted-foreground">
          Each version is one Meta ad: download its ZIP (every size, standard file names) and use the ad name shown so
          results can be tracked.
        </p>
      </header>

      {!concepts.length ? (
        <p className="py-10 text-center text-xs text-muted-foreground">Nothing is shared here right now.</p>
      ) : (
        folders.map((folder) => (
          <section key={folder} className="space-y-3">
            {share.scope === "all" ? <h2 className="text-sm font-semibold">{folder}</h2> : null}
            {byFolder.get(folder)!.map((c) => (
              <ConceptBlock key={c.code} concept={c} base={base} />
            ))}
          </section>
        ))
      )}
    </main>
  );
}

function ConceptBlock({ concept: c, base }: { concept: Concept; base: string }) {
  return (
    <article className="rounded-lg border border-border bg-panel">
      <div className="space-y-0.5 border-b border-border px-3 py-2">
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-mono font-semibold">{creativeCode(c.code)}</span>
          <span className="font-medium">{c.angle}</span>
          <span className="rounded border border-border px-1 text-2xs text-muted-foreground">
            {c.format}
            {c.format === "UGC" && c.creator ? ` · ${c.creator}` : ""}
          </span>
        </p>
        {c.hook ? <p className="text-xs text-muted-foreground">“{c.hook}”</p> : null}
      </div>
      {c.versions.map((v) => (
        <div key={v.version} className="border-b border-border last:border-b-0">
          <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
            <span className="text-xs font-semibold">Version {v.version}</span>
            <CopyText text={adNameOf(v.files[0])} />
            <a
              href={`${base}/zip?code=${c.code}&version=${v.version}`}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-2xs font-medium hover:border-accent/60"
            >
              <Download className="h-3 w-3" /> ZIP for Meta
            </a>
          </div>
          <div className="flex flex-wrap items-end gap-3 p-3">
            {v.files.map((f) => {
              const [w, h] = f.aspectRatio.split("x").map(Number);
              const src = `${base}/file/${f.id}`;
              return (
                <figure key={f.id} className="space-y-1">
                  <div
                    className="h-60 overflow-hidden rounded-md border border-border bg-muted"
                    style={{ aspectRatio: w && h ? `${w} / ${h}` : "4 / 5" }}
                  >
                    {f.kind === "video" ? (
                      <video
                        src={src}
                        poster={f.thumbUrl ? `${src}?thumb=1` : undefined}
                        controls
                        preload="none"
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <a href={src} target="_blank" rel="noreferrer" title="Open full size">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={f.thumbUrl ? `${src}?thumb=1` : src}
                          alt={f.aspectRatio}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </a>
                    )}
                  </div>
                  <figcaption className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                    <span>
                      {f.aspectRatio.replace("x", ":")}
                      {f.width && f.height ? ` · ${f.width}×${f.height}` : ""}
                      {f.durationSeconds ? ` · ${fmtDuration(f.durationSeconds)}` : ""}
                    </span>
                    <a href={`${src}?download=1`} className="inline-flex items-center gap-0.5 hover:text-foreground">
                      <Download className="h-3 w-3" /> Download
                    </a>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      ))}
    </article>
  );
}
