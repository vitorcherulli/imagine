import { CREATIVE_FORMATS, CREATIVE_RATIOS } from "@/lib/creatives";

const PARTS: [string, string, string][] = [
  ["C013", "Code", "C for creative — one per concept (hook or idea). Assigned automatically and never reused."],
  ["EXTRATOR", "Product", "What the ad sells. Keep the same spelling so results group correctly."],
  ["IAVendeSozinha", "Angle", "The promise in a few words."],
  ["UGC-Marina", "Format", "IMG, CARR, VID or UGC — UGC also carries who is on camera."],
  ["9x16", "Ratio", "Detected from the file."],
  ["v2", "Version", "Another execution of the same hook: new image, cut, text or thumbnail."],
  ["_EN", "Language", "Only added when it isn't Portuguese."],
];

export function CreativesGuide() {
  return (
    <div className="space-y-5 text-xs">
      <section className="rounded-lg border border-border bg-panel p-4">
        <p className="mb-3 font-mono text-sm">
          C013_EXTRATOR_IAVendeSozinha_UGC-Marina_9x16_v2<span className="text-muted-foreground">_EN</span>
        </p>
        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[110px_80px_minmax(0,1fr)]">
          {PARTS.map(([sample, label, text]) => (
            <div key={label} className="contents">
              <dt className="font-mono text-accent">{sample}</dt>
              <dd className="font-medium">{label}</dd>
              <dd className="text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-panel p-4">
          <h3 className="mb-2 font-semibold">Rules</h3>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            <li>
              <b className="text-foreground">New hook → new code.</b> A different first line or first 3 seconds is a new
              concept.
            </li>
            <li>
              <b className="text-foreground">Same hook, new execution → new version</b> of the same code.
            </li>
            <li>
              <b className="text-foreground">Same piece, other size → same code and version</b>, only the ratio
              changes.
            </li>
            <li>
              <b className="text-foreground">The ad name in Meta must contain the code.</b> That is how imported
              results find the creative — copy it from the Library. It leaves out the ratio
              (C013_EXTRATOR_IAVendeSozinha_UGC-Marina_v2) because one ad can carry every size of a version.
            </li>
            <li>Don&apos;t delete losers: mark them Pause or Archived and write what you learned in the notes.</li>
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-panel p-4">
          <h3 className="mb-2 font-semibold">Sizes for Meta</h3>
          <ul className="space-y-1">
            {Object.entries(CREATIVE_RATIOS).map(([r, label]) => (
              <li key={r} className="flex gap-2">
                <span className="w-12 font-mono">{r.replace("x", ":")}</span>
                <span className="text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-2xs text-muted-foreground">
            Every concept should have at least a 4:5 (feed) and a 9:16 (Stories / Reels) file.
          </p>
          <h3 className="mb-1 mt-3 font-semibold">Formats</h3>
          <ul className="space-y-1">
            {Object.entries(CREATIVE_FORMATS).map(([f, label]) => (
              <li key={f} className="flex gap-2">
                <span className="w-12 font-mono">{f}</span>
                <span className="text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
