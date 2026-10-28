"use client";

import React from "react";
import dynamic from "next/dynamic";

// Remotion (Player, fontes) só roda no navegador — carregado sem SSR.
const MotionEditor = dynamic(
  () => import("@/components/motion/MotionEditor").then((m) => m.MotionEditor),
  { ssr: false, loading: () => <div className="p-8 text-sm text-muted-foreground">Carregando editor…</div> },
);

export default function MotionEditorPage({ params }: { params: { id: string } }) {
  return (
    <div className="h-full">
      <MotionEditor designId={params.id} />
    </div>
  );
}
