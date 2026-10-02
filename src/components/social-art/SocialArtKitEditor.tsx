"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SocialArtCanvas } from "@/components/social-art/SocialArtCanvas";
import {
  ColorField,
  SegmentedControl,
  SocialArtPanel,
  ToggleRow,
} from "@/components/social-art/SocialArtControls";
import { autosaveLabel, useSocialArtAutosave } from "@/components/social-art/use-social-art-autosave";
import { SOCIAL_ART_FONT_OPTIONS, injectSocialArtFonts } from "@/lib/social-art/fonts";
import type { SocialArtKitPatch } from "@/lib/social-art/schemas";
import type {
  SocialArtBrand,
  SocialArtColors,
  SocialArtFormat,
  SocialArtPost,
  SocialArtSlide,
} from "@/lib/social-art/types";
import { cn } from "@/lib/utils";

type PreviewKind = "photo" | "text" | "number";

function sampleSlide(partial: Partial<SocialArtSlide> & Pick<SocialArtSlide, "id" | "layout">): SocialArtSlide {
  return {
    position: "bottom",
    lead: "",
    title: "",
    body: "",
    tag: "",
    photo: "",
    focusX: 50,
    focusY: 50,
    zoom: 100,
    ...partial,
  };
}

function samplePost(brand: SocialArtBrand, photo: string, format: SocialArtFormat): SocialArtPost {
  return {
    format,
    showHandle: true,
    showLogo: true,
    decor: brand.decorDefault,
    showCounter: true,
    slides: [
      sampleSlide({
        id: "photo",
        layout: "photo",
        lead: "Made with care",
        title: "Your brand here",
        body: "Supporting line from the slide body text.",
        photo,
      }),
      sampleSlide({
        id: "text",
        layout: "text",
        lead: "Tip 1",
        title: "Short, clear titles win",
        body: "Supporting text explains the idea in one or two sentences, with the brand colors and fonts.",
      }),
      sampleSlide({ id: "number", layout: "number", lead: "Since", title: "1998", tag: "Tradition", photo }),
    ],
  };
}

function FontSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger style={{ fontFamily: value }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SOCIAL_ART_FONT_OPTIONS.map((f) => (
            <SelectItem key={f.family} value={f.family}>
              <span style={{ fontFamily: f.family }}>{f.family}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface Props {
  dnaId: string;
  initialBrand: SocialArtBrand;
  /** First client gallery photo, used in the preview. */
  samplePhoto: string;
}

export function SocialArtKitEditor({ dnaId, initialBrand, samplePhoto }: Props) {
  const [brand, setBrand] = React.useState(initialBrand);
  const [preview, setPreview] = React.useState<PreviewKind>("photo");
  const [format, setFormat] = React.useState<SocialArtFormat>("feed");
  const autosave = useSocialArtAutosave<SocialArtKitPatch>(`/api/project-dna/${dnaId}/art-kit`);

  React.useEffect(() => injectSocialArtFonts(), []);

  function update(patch: SocialArtKitPatch) {
    setBrand((b) => ({ ...b, ...patch }));
    autosave.schedule(patch);
  }

  function updateColor(key: keyof SocialArtColors, value: string) {
    update({ colors: { ...brand.colors, [key]: value } });
  }

  const post = React.useMemo(() => samplePost(brand, samplePhoto, format), [brand, samplePhoto, format]);
  const previewIndex = preview === "photo" ? 0 : preview === "text" ? 1 : 2;
  const status = autosaveLabel(autosave.state);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/dna/${dnaId}`} aria-label="Back to Project DNA">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Brand art kit — {brand.name}</h1>
            <p className="text-2xs text-muted-foreground">
              Colors, fonts and handle drawn over every publication slide of this DNA.
              {status ? (
                <span className={cn("ml-1", autosave.state === "error" && "text-destructive")}>· {status}</span>
              ) : null}
            </p>
          </div>
        </div>
      </header>

      <div className="grid flex-1 items-start gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex flex-col items-center gap-3 lg:sticky lg:top-5" aria-label="Brand preview">
          <div className="flex w-full justify-center rounded-lg border border-border bg-muted/40 p-4">
            <SocialArtCanvas
              brand={brand}
              post={post}
              index={previewIndex}
              className="block h-auto max-h-[calc(100vh-14rem)] w-auto max-w-full rounded-sm shadow-lg"
            />
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <SegmentedControl<PreviewKind>
              label="Preview layout"
              value={preview}
              onChange={setPreview}
              options={[
                { value: "photo", label: "Photo + title" },
                { value: "text", label: "Text on color" },
                { value: "number", label: "Big number" },
              ]}
            />
            <SegmentedControl<SocialArtFormat>
              label="Format"
              value={format}
              onChange={setFormat}
              options={[
                { value: "feed", label: "4:5" },
                { value: "square", label: "1:1" },
                { value: "story", label: "9:16" },
              ]}
            />
          </div>
          {!samplePhoto ? (
            <p className="text-2xs text-muted-foreground">
              Upload photos to this DNA&apos;s client gallery to preview them here.
            </p>
          ) : null}
        </section>

        <div className="flex flex-col gap-4">
          <SocialArtPanel title="Identity">
            <div className="flex items-center gap-3 rounded-md border border-border bg-background p-2">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                {brand.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-2xs text-muted-foreground">No logo</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">Logo</p>
                <p className="text-2xs text-muted-foreground">
                  Comes from the Project DNA (PNG with transparency works best).
                </p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/dna/${dnaId}`}>
                  <ExternalLink className="h-3.5 w-3.5" /> Edit DNA
                </Link>
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="kit-handle">Instagram handle</Label>
              <Input
                id="kit-handle"
                maxLength={60}
                placeholder="@yourbrand"
                value={brand.handle}
                onChange={(e) => update({ handle: e.target.value })}
              />
            </div>
          </SocialArtPanel>

          <SocialArtPanel title="Colors">
            <div className="grid grid-cols-3 gap-3">
              <ColorField label="Dark" value={brand.colors.dark} onChange={(v) => updateColor("dark", v)} />
              <ColorField label="Accent" value={brand.colors.accent} onChange={(v) => updateColor("accent", v)} />
              <ColorField label="Light" value={brand.colors.light} onChange={(v) => updateColor("light", v)} />
            </div>
            <p className="text-2xs text-muted-foreground">
              Dark is the text-slide background, accent highlights titles, light is the mist over photos.
            </p>
            <ToggleRow checked={brand.accentShine} onChange={(accentShine) => update({ accentShine })}>
              Metallic shine on the accent color
            </ToggleRow>
          </SocialArtPanel>

          <SocialArtPanel title="Typography">
            <div className="grid grid-cols-2 gap-3">
              <FontSelect label="Titles" value={brand.fontHeading} onChange={(fontHeading) => update({ fontHeading })} />
              <FontSelect label="Body" value={brand.fontBody} onChange={(fontBody) => update({ fontBody })} />
            </div>
            <ToggleRow checked={brand.uppercaseTitles} onChange={(uppercaseTitles) => update({ uppercaseTitles })}>
              Uppercase titles
            </ToggleRow>
          </SocialArtPanel>

          <SocialArtPanel title="Decorative shapes">
            <div className="grid grid-cols-2 items-end gap-3">
              <ColorField label="Shape color" value={brand.decorColor} onChange={(decorColor) => update({ decorColor })} />
              <div className="pb-2">
                <ToggleRow checked={brand.decorDefault} onChange={(decorDefault) => update({ decorDefault })}>
                  On by default
                </ToggleRow>
              </div>
            </div>
          </SocialArtPanel>
        </div>
      </div>
    </div>
  );
}
