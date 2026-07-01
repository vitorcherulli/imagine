"use client";

import * as React from "react";

interface Props {
  startSeconds: number;
  pxPerSecond: number;
  rowHeight: number;
  children: React.ReactNode;
}

/** Positions a clip on the timeline (linked layout — no free drag). */
export function TimelineClip({ startSeconds, pxPerSecond, rowHeight, children }: Props) {
  return (
    <div
      className="absolute top-1/2 z-10 -translate-y-1/2"
      style={{
        left: startSeconds * pxPerSecond,
        height: rowHeight - 8,
      }}
    >
      {children}
    </div>
  );
}
