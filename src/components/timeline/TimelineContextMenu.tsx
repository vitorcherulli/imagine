"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Copy, ImageIcon, Link2, Unlink, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlockMediaField } from "@/lib/block-media";
import type { JoinableNarrationTarget } from "@/lib/narration-group-reorder";

export interface TimelineContextMenuTarget {
  x: number;
  y: number;
  blockIds: string[];
  /** Media that can be cleared on the primary block (first id). */
  removableMedia?: BlockMediaField[];
  canMoveEarlier?: boolean;
  canMoveLater?: boolean;
  joinNarrationTargets?: JoinableNarrationTarget[];
  canLeaveNarrationGroup?: boolean;
}

interface Props {
  target: TimelineContextMenuTarget;
  onClose: () => void;
  onDelete: (blockIds: string[]) => void;
  onClearMedia?: (blockId: string, field: BlockMediaField) => void;
  onMoveEarlier?: (blockId: string) => void;
  onMoveLater?: (blockId: string) => void;
  onJoinNarration?: (
    blockId: string,
    groupId: string,
    placement: JoinableNarrationTarget["placement"],
  ) => void;
  onLeaveNarrationGroup?: (blockId: string) => void;
  onDuplicate?: (blockId: string) => void;
}

const mediaLabels: Record<BlockMediaField, string> = {
  keyframe: "Remove keyframe image",
  video: "Remove video",
  audio: "Remove narration audio",
  sceneAudio: "Remove scene audio",
};

export function TimelineContextMenu({
  target,
  onClose,
  onDelete,
  onClearMedia,
  onMoveEarlier,
  onMoveLater,
  onJoinNarration,
  onLeaveNarrationGroup,
  onDuplicate,
}: Props) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const primaryBlockId = target.blockIds[0];
  const canClearMedia =
    Boolean(onClearMedia) &&
    Boolean(primaryBlockId) &&
    target.blockIds.length === 1 &&
    (target.removableMedia?.length ?? 0) > 0;
  const canMove =
    target.blockIds.length === 1 &&
    Boolean(primaryBlockId) &&
    Boolean(onMoveEarlier || onMoveLater);
  const joinTargets = target.joinNarrationTargets ?? [];
  const canJoinNarration =
    target.blockIds.length === 1 &&
    Boolean(primaryBlockId) &&
    Boolean(onJoinNarration) &&
    joinTargets.length > 0;
  const canLeaveNarration =
    target.blockIds.length === 1 &&
    Boolean(primaryBlockId) &&
    Boolean(onLeaveNarrationGroup) &&
    target.canLeaveNarrationGroup;
  const canDuplicate =
    target.blockIds.length === 1 && Boolean(primaryBlockId) && Boolean(onDuplicate);
  const hasNarrationActions = canJoinNarration || canLeaveNarration;

  React.useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  React.useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const padding = 8;
    let left = target.x;
    let top = target.y;
    if (left + rect.width > window.innerWidth - padding) {
      left = window.innerWidth - rect.width - padding;
    }
    if (top + rect.height > window.innerHeight - padding) {
      top = window.innerHeight - rect.height - padding;
    }
    el.style.left = `${Math.max(padding, left)}px`;
    el.style.top = `${Math.max(padding, top)}px`;
  }, [target.x, target.y, canClearMedia, target.removableMedia?.length, joinTargets.length, hasNarrationActions, canDuplicate]);

  const deleteLabel =
    target.blockIds.length > 1
      ? `Delete ${target.blockIds.length} blocks`
      : "Delete entire block";

  const content = (
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        "fixed z-[10000] min-w-[180px] overflow-hidden rounded-md border border-border bg-panel p-1 text-foreground shadow-lg",
      )}
      style={{ left: target.x, top: target.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {canMove ? (
        <>
          {onMoveEarlier && target.canMoveEarlier ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
              onClick={() => {
                onMoveEarlier(primaryBlockId!);
                onClose();
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              Move earlier
            </button>
          ) : null}
          {onMoveLater && target.canMoveLater ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
              onClick={() => {
                onMoveLater(primaryBlockId!);
                onClose();
              }}
            >
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              Move later
            </button>
          ) : null}
          {(target.canMoveEarlier || target.canMoveLater) && (canClearMedia || hasNarrationActions) ? (
            <div className="my-1 h-px bg-border" />
          ) : null}
        </>
      ) : null}
      {canLeaveNarration ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
          onClick={() => {
            onLeaveNarrationGroup?.(primaryBlockId!);
            onClose();
          }}
        >
          <Unlink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          Detach from narration group
        </button>
      ) : null}
      {canJoinNarration
        ? joinTargets.map((joinTarget) => (
            <button
              key={`${joinTarget.groupId}:${joinTarget.placement}`}
              type="button"
              role="menuitem"
              className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
              onClick={() => {
                onJoinNarration?.(primaryBlockId!, joinTarget.groupId, joinTarget.placement);
                onClose();
              }}
            >
              <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                {joinTarget.adjacent ? "Rejoin narration" : "Move & join narration"}
                <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                  {joinTarget.label}
                </span>
              </span>
            </button>
          ))
        : null}
      {hasNarrationActions && canClearMedia ? <div className="my-1 h-px bg-border" /> : null}
      {canClearMedia
        ? target.removableMedia!.map((field) => (
            <button
              key={field}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
              onClick={() => {
                onClearMedia?.(primaryBlockId!, field);
                onClose();
              }}
            >
              <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {mediaLabels[field]}
            </button>
          ))
        : null}
      {canClearMedia ? <div className="my-1 h-px bg-border" /> : null}
      {canDuplicate ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
          onClick={() => {
            onDuplicate?.(primaryBlockId!);
            onClose();
          }}
        >
          <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          Duplicate block
        </button>
      ) : null}
      {canDuplicate ? <div className="my-1 h-px bg-border" /> : null}
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
        onClick={() => onDelete(target.blockIds)}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        {deleteLabel}
      </button>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
