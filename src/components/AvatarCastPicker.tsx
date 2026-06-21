"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Star, UserSquare } from "lucide-react";
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
  /** grid = new project form · compact = smaller tiles */
  variant?: "grid" | "compact";
  manageHref?: string;
}

export function AvatarCastPicker({
  avatars,
  value,
  onChange,
  variant = "grid",
  manageHref = "/avatars",
}: Props) {
  const { selectedIds, primaryId } = value;

  function toggle(id: string) {
    const isSelected = selectedIds.includes(id);
    if (isSelected) {
      const nextIds = selectedIds.filter((x) => x !== id);
      const nextPrimary =
        primaryId === id ? (nextIds[0] ?? null) : primaryId && nextIds.includes(primaryId) ? primaryId : nextIds[0] ?? null;
      onChange({ selectedIds: nextIds, primaryId: nextPrimary });
      return;
    }
    const nextIds = [...selectedIds, id];
    onChange({
      selectedIds: nextIds,
      primaryId: primaryId && nextIds.includes(primaryId) ? primaryId : nextIds[0] ?? id,
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

  const tileClass =
    variant === "compact"
      ? "grid grid-cols-4 gap-1.5 sm:grid-cols-5"
      : "grid grid-cols-3 gap-2 sm:grid-cols-4";

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground">
        Tap to include in the project. Star = main character in the story.
      </p>
      <div className={tileClass}>
        {avatars.map((avatar) => {
          const selected = selectedIds.includes(avatar.id);
          const isPrimary = primaryId === avatar.id;
          return (
            <div key={avatar.id} className="relative">
              <button
                type="button"
                onClick={() => toggle(avatar.id)}
                className={cn(
                  "relative flex w-full flex-col overflow-hidden rounded-md border text-left transition-colors",
                  selected
                    ? "border-accent ring-1 ring-accent/40"
                    : "border-border bg-panel hover:border-accent/30",
                )}
                title={avatar.name}
              >
                <div
                  className={cn(
                    "relative w-full bg-muted",
                    variant === "compact" ? "aspect-square" : "aspect-[3/4]",
                  )}
                >
                  {avatar.primaryImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatar.primaryImageUrl}
                      alt={avatar.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <UserSquare className="h-5 w-5" />
                    </div>
                  )}
                  {selected && (
                    <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <span className="truncate px-1 py-0.5 text-[10px] font-medium">{avatar.name}</span>
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
                    "absolute -left-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background shadow-sm",
                    isPrimary
                      ? "border-amber-400 text-amber-500"
                      : "border-border text-muted-foreground hover:text-amber-500",
                  )}
                >
                  <Star className={cn("h-2.5 w-2.5", isPrimary && "fill-current")} />
                </button>
              )}
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
