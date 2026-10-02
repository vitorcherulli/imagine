"use client";

import * as React from "react";
import { SocialArtCanvas } from "@/components/social-art/SocialArtCanvas";
import { ColorField } from "@/components/social-art/SocialArtControls";
import { Button } from "@/components/ui/button";
import { resolveSocialArtBrand } from "@/lib/social-art/model";
import {
  DEFAULT_SOCIAL_ART_SETTINGS,
  SOCIAL_TITLE_STYLE_IDS,
  SOCIAL_TITLE_STYLES,
  type SocialArtBrand,
  type SocialArtColors,
  type SocialArtFormat,
  type SocialArtPost,
  type SocialArtSlide,
  type SocialTitleStyleId,
} from "@/lib/social-art/types";
import { cn } from "@/lib/utils";

interface Props {
  /** Brand kit look, before publication overrides. */
  brand: SocialArtBrand;
  titleStyle: SocialTitleStyleId | null;
  colors: SocialArtColors | null;
  onChange: (patch: { titleStyle?: SocialTitleStyleId | null; colors?: SocialArtColors | null }) => void;
  /** Slide drawn in every preview card. */
  sample: SocialArtSlide;
  format: SocialArtFormat;
  suggestedStyle?: SocialTitleStyleId | null;
  suggestedPalette?: SocialArtColors | null;
}

const OPTIONS: Array<SocialTitleStyleId | null> = [null, ...SOCIAL_TITLE_STYLE_IDS];

const sameColors = (a: SocialArtColors | null | undefined, b: SocialArtColors | null | undefined) =>
  !!a && !!b && a.dark === b.dark && a.accent === b.accent && a.light === b.light;

export function SocialTitleStylePicker({
  brand,
  titleStyle,
  colors,
  onChange,
  sample,
  format,
  suggestedStyle,
  suggestedPalette,
}: Props) {
  const post = React.useMemo<SocialArtPost>(
    () => ({
      format,
      slides: [sample],
      showHandle: false,
      showLogo: false,
      decor: brand.decorDefault,
      showCounter: false,
    }),
    [format, sample, brand.decorDefault],
  );
  const brands = React.useMemo(
    () =>
      OPTIONS.map((id) =>
        resolveSocialArtBrand(brand, { ...DEFAULT_SOCIAL_ART_SETTINGS, titleStyle: id, colors }),
      ),
    [brand, colors],
  );
  const shown = colors ?? brand.colors;

  function setColor(key: keyof SocialArtColors, value: string) {
    onChange({ colors: { ...shown, [key]: value } });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Title style">
        {OPTIONS.map((id, i) => {
          const selected = titleStyle === id;
          return (
            <button
              key={id ?? "brand"}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ titleStyle: id })}
              className={cn(
                "group flex min-w-0 flex-col gap-1 rounded-md border p-0.5 text-left transition-colors",
                selected ? "border-accent ring-2 ring-accent/30" : "border-border hover:border-accent/40",
              )}
            >
              <SocialArtCanvas brand={brands[i]} post={post} index={0} className="block h-auto w-full rounded-sm" />
              <span className="flex items-center justify-between gap-1 px-0.5 text-[10px] font-medium leading-tight">
                <span className="truncate" title={id ? SOCIAL_TITLE_STYLES[id].label : "Brand kit"}>
                  {id ? SOCIAL_TITLE_STYLES[id].label : "Brand kit"}
                </span>
                {id && id === suggestedStyle ? (
                  <span className="shrink-0 rounded bg-accent/15 px-1 text-[10px] text-accent">Ref</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium">Colors</span>
          <div className="flex flex-wrap gap-1">
            {suggestedPalette && !sameColors(colors, suggestedPalette) ? (
              <Button variant="ghost" size="sm" onClick={() => onChange({ colors: suggestedPalette })}>
                <span className="flex">
                  {(["dark", "accent", "light"] as const).map((k) => (
                    <span
                      key={k}
                      className="-ml-1 h-3 w-3 rounded-full border border-background first:ml-0"
                      style={{ background: suggestedPalette[k] }}
                    />
                  ))}
                </span>
                From references
              </Button>
            ) : null}
            {colors ? (
              <Button variant="ghost" size="sm" onClick={() => onChange({ colors: null })}>
                Brand colors
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ColorField label="Dark" value={shown.dark} onChange={(v) => setColor("dark", v)} />
          <ColorField label="Accent" value={shown.accent} onChange={(v) => setColor("accent", v)} />
          <ColorField label="Light" value={shown.light} onChange={(v) => setColor("light", v)} />
        </div>
      </div>
    </div>
  );
}
