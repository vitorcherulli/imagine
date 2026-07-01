"use client";

import * as React from "react";
import { Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { timelineThumbCandidates, type TimelineVisualBlock } from "@/lib/timeline-preview-media";

interface Props {
  visual: TimelineVisualBlock | null | undefined;
  className?: string;
  iconClassName?: string;
}

/** Timeline / preview still — only uses keyframe URLs from the block (jpg/png alternate). */
export function TimelineThumbImage({ visual, className, iconClassName }: Props) {
  const candidates = React.useMemo(() => timelineThumbCandidates(visual), [visual]);
  const candidatesKey = candidates.join("|");
  const [index, setIndex] = React.useState(0);
  const [exhausted, setExhausted] = React.useState(false);

  React.useEffect(() => {
    setIndex(0);
    setExhausted(false);
  }, [candidatesKey]);

  const url = candidates[index];

  if (!url || exhausted) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-black/40 text-white/50",
          className,
        )}
      >
        <Film className={cn("h-4 w-4", iconClassName)} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={url}
      src={url}
      alt=""
      className={cn("h-full w-full object-cover", className)}
      onError={() => {
        if (index + 1 < candidates.length) {
          setIndex((i) => i + 1);
        } else {
          setExhausted(true);
        }
      }}
    />
  );
}
