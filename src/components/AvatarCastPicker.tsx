"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Star, UserSquare, UserX } from "lucide-react";
import type { Avatar } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export interface AvatarCastValue {
  selectedIds: string[];
  primaryId: string | null;
}

interface Props {
  avatars: Avatar[];
  value: AvatarCastValue;
  onChange: (value: AvatarCastValue) => void;
  /** @deprecated Use circles layout (default). Kept for call-site compatibility. */
  variant?: "grid" | "compact" | "circles";
  manageHref?: string;
}

export function AvatarThumb({
  imageUrl,
  name,
  size = "sm",
  fallback = "avatar",
  className,
}: {
  imageUrl?: string | null;
  name?: string;
  size?: "sm" | "md";
  fallback?: "avatar" | "none" | "inherit";
  className?: string;
}) {
  const dim = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  const iconClass = size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name ?? ""}
        title={name}
        className={cn(dim, "shrink-0 rounded-full border border-border/60 object-cover bg-muted", className)}
      />
    );
  }

  const FallbackIcon =
    fallback === "none" ? UserX : fallback === "inherit" ? UserSquare : UserSquare;

  return (
    <span
      className={cn(
        dim,
        "flex shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground",
        fallback === "none" && "border-dashed",
        className,
      )}
      title={name}
    >
      <FallbackIcon className={iconClass} />
    </span>
  );
}

export function AvatarCastPicker({
  avatars,
  value,
  onChange,
  manageHref = "/avatars",
}: Props) {
  const { selectedIds, primaryId } = value;

  function toggle(id: string) {
    const isSelected = selectedIds.includes(id);
    if (isSelected) {
      const nextIds = selectedIds.filter((x) => x !== id);
      const nextPrimary =
        primaryId === id
          ? (nextIds[0] ?? null)
          : primaryId && nextIds.includes(primaryId)
            ? primaryId
            : (nextIds[0] ?? null);
      onChange({ selectedIds: nextIds, primaryId: nextPrimary });
      return;
    }
    const nextIds = [...selectedIds, id];
    onChange({
      selectedIds: nextIds,
      primaryId: primaryId && nextIds.includes(primaryId) ? primaryId : (nextIds[0] ?? id),
    });
  }

  function setPrimary(id: string) {
    if (!selectedIds.includes(id)) {
      onChange({ selectedIds: [...selectedIds, id], primaryId: id });
      return;
    }
    onChange({ selectedIds, primaryId: id });
  }

  if (avatars.length === 0) {
    return (
      <Link
        href={manageHref}
        className="flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-2xs text-muted-foreground hover:border-accent/40 hover:bg-muted/60"
      >
        <UserSquare className="h-3.5 w-3.5" />
        No avatars yet — upload reference photos to keep characters consistent.
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">
        Tap a circle to include in the project. Star = main character.
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-2.5">
        {avatars.map((avatar) => {
          const selected = selectedIds.includes(avatar.id);
          const isPrimary = primaryId === avatar.id;
          return (
            <div key={avatar.id} className="relative flex w-11 flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={() => toggle(avatar.id)}
                className={cn(
                  "relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 bg-muted transition-colors",
                  selected
                    ? "border-accent ring-2 ring-accent/25"
                    : "border-border hover:border-accent/40",
                )}
                title={avatar.name}
              >
                {avatar.primaryImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar.primaryImageUrl}
                    alt={avatar.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <UserSquare className="h-4 w-4" />
                  </span>
                )}
                {selected && (
                  <span className="absolute bottom-0 right-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-accent-foreground ring-2 ring-background">
                    <Check className="h-2 w-2" strokeWidth={3} />
                  </span>
                )}
              </button>
              {selected && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPrimary(avatar.id);
                  }}
                  title="Main character"
                  className={cn(
                    "absolute -left-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border bg-background shadow-sm",
                    isPrimary
                      ? "border-amber-400 text-amber-500"
                      : "border-border text-muted-foreground hover:border-amber-300 hover:text-amber-500",
                  )}
                >
                  <Star className={cn("h-2 w-2", isPrimary && "fill-current")} />
                </button>
              )}
              <span
                className="max-w-11 truncate text-center text-[9px] leading-tight text-muted-foreground"
                title={avatar.name}
              >
                {avatar.name.split(/\s+/)[0]}
              </span>
            </div>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {selectedIds.length} in cast
          {primaryId
            ? ` · lead: ${avatars.find((a) => a.id === primaryId)?.name ?? "—"}`
            : ""}
        </p>
      )}
    </div>
  );
}

/** Small avatar stack for headers */
export function AvatarCastPreview({
  avatars,
  selectedIds,
  primaryId,
  max = 3,
}: {
  avatars: Avatar[];
  selectedIds: string[];
  primaryId: string | null;
  max?: number;
}) {
  const cast = selectedIds
    .map((id) => avatars.find((a) => a.id === id))
    .filter((a): a is Avatar => !!a);
  if (cast.length === 0) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
        <UserSquare className="h-3.5 w-3.5" />
      </span>
    );
  }
  const shown = cast.slice(0, max);
  return (
    <div className="flex -space-x-2">
      {shown.map((a) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={a.id}
          src={a.primaryImageUrl ?? ""}
          alt={a.name}
          title={a.id === primaryId ? `${a.name} (lead)` : a.name}
          className={cn(
            "h-7 w-7 rounded-full border-2 border-background object-cover bg-muted",
            a.id === primaryId && "ring-1 ring-amber-400",
          )}
        />
      ))}
      {cast.length > max && (
        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-medium">
          +{cast.length - max}
        </span>
      )}
    </div>
  );
}
