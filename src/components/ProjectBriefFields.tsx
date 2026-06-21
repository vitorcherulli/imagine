"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProjectDnaPicker } from "@/components/ProjectDnaPicker";
import type { ProjectDna } from "@/lib/db/schema";
import {
  EPISODE_STORY_HINT,
  EPISODE_STORY_LABEL,
  PROJECT_IDENTITY_LABEL,
} from "@/lib/project-identity";

interface Props {
  projectDnaId: string | null;
  projectDnaItems: ProjectDna[];
  storyDescription: string;
  onChange: (patch: { projectDnaId?: string | null; storyDescription?: string }) => void;
  onSave: (patch: { projectDnaId?: string | null; storyDescription?: string }) => Promise<void>;
}

export function ProjectBriefFields({
  projectDnaId,
  projectDnaItems,
  storyDescription,
  onChange,
  onSave,
}: Props) {
  const saveRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = React.useRef<{ projectDnaId?: string | null; storyDescription?: string }>({});

  React.useEffect(() => {
    return () => {
      if (saveRef.current) clearTimeout(saveRef.current);
    };
  }, []);

  function queueSave(patch: { projectDnaId?: string | null; storyDescription?: string }) {
    pendingRef.current = { ...pendingRef.current, ...patch };
    onChange(patch);
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      const body = pendingRef.current;
      pendingRef.current = {};
      void onSave(body);
    }, patch.projectDnaId !== undefined ? 0 : 500);
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-2xs">{PROJECT_IDENTITY_LABEL}</Label>
        <div className="mt-1.5">
          <ProjectDnaPicker
            items={projectDnaItems}
            value={projectDnaId}
            onChange={(id) => queueSave({ projectDnaId: id })}
          />
        </div>
      </div>
      <div>
        <Label className="text-2xs">{EPISODE_STORY_LABEL}</Label>
        <p className="mb-1.5 text-[10px] text-muted-foreground">{EPISODE_STORY_HINT}</p>
        <Textarea
          value={storyDescription}
          onChange={(e) => queueSave({ storyDescription: e.target.value })}
          placeholder="This episode's synopsis…"
          className="min-h-[72px] text-2xs"
        />
      </div>
    </div>
  );
}
