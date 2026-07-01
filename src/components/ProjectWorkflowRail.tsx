"use client";

import * as React from "react";
import {
  Check,
  Clapperboard,
  Download,
  FileText,
  FolderKanban,
  Images,
  Languages,
  LayoutPanelTop,
  Mic,
  Music2,
  Youtube,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ProjectWorkflowAction,
  ProjectWorkflowState,
  ProjectWorkflowStep,
  ProjectWorkflowStepId,
} from "@/lib/project-workflow";

const STEP_ICONS: Record<ProjectWorkflowStepId, React.ComponentType<{ className?: string }>> = {
  project: FolderKanban,
  script: FileText,
  pronunciation: Languages,
  music_pauses: Music2,
  media: Images,
  narration: Mic,
  timeline: LayoutPanelTop,
  edit: Clapperboard,
  youtube: Youtube,
  export: Download,
};

interface Props {
  workflow: ProjectWorkflowState;
  onStepAction: (step: ProjectWorkflowStep, action: ProjectWorkflowAction) => void;
  className?: string;
}

export function ProjectWorkflowRail({ workflow, onStepAction, className }: Props) {
  const [openStepId, setOpenStepId] = React.useState<ProjectWorkflowStepId | null>(null);
  const openStep = workflow.steps.find((step) => step.id === openStepId) ?? null;

  React.useEffect(() => {
    if (!openStepId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenStepId(null);
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-workflow-rail]")) return;
      setOpenStepId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openStepId]);

  return (
    <div
      data-workflow-rail
      className={cn("relative flex min-w-0 items-center justify-end gap-1", className)}
    >
      <div className="hidden shrink-0 text-[10px] font-medium text-muted-foreground sm:block">
        <span className="hidden md:inline">Fluxo </span>
        <span className="tabular-nums text-foreground">{workflow.progressPercent}%</span>
      </div>

      <div className="scrollbar-none flex min-w-0 items-center gap-px overflow-x-auto pb-0.5">
        {workflow.steps.map((step, index) => {
          const Icon = STEP_ICONS[step.id];
          const isLast = index === workflow.steps.length - 1;
          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                title={`${step.label}${step.detail ? ` · ${step.detail}` : ""}`}
                aria-label={step.label}
                aria-current={step.status === "current" ? "step" : undefined}
                onClick={() => {
                  setOpenStepId((current) => (current === step.id ? null : step.id));
                }}
                className={cn(
                  "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  step.status === "complete" &&
                    "border-success/40 bg-success/10 text-success hover:bg-success/15",
                  step.status === "current" &&
                    "border-accent/50 bg-accent/15 text-accent shadow-sm ring-1 ring-accent/25",
                  step.status === "pending" &&
                    "border-border/70 bg-background text-muted-foreground hover:border-accent/30 hover:text-foreground",
                )}
              >
                {step.status === "complete" ? (
                  <Check className="h-2 w-2" strokeWidth={3} />
                ) : (
                  <Icon className="h-2 w-2" />
                )}
              </button>
              {!isLast ? (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-1.5 shrink-0",
                    step.status === "complete" ? "bg-success/40" : "bg-border/70",
                  )}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>

      {openStep ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-2.5 shadow-lg">
          <div className="flex items-start gap-2">
            <div
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                openStep.status === "complete" && "border-success/40 bg-success/10 text-success",
                openStep.status === "current" && "border-accent/50 bg-accent/15 text-accent",
                openStep.status === "pending" && "border-border bg-muted text-muted-foreground",
              )}
            >
              {openStep.status === "complete" ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : (
                React.createElement(STEP_ICONS[openStep.id], { className: "h-3 w-3" })
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">{openStep.label}</p>
              <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                {openStep.description}
              </p>
              {openStep.detail ? (
                <p className="mt-1 text-2xs font-medium text-foreground/80">{openStep.detail}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-2xs font-medium text-foreground transition-colors hover:bg-muted"
            onClick={() => {
              onStepAction(openStep, openStep.action);
              setOpenStepId(null);
            }}
          >
            {openStep.status === "complete" ? "Revisar passo" : "Ir para este passo"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
