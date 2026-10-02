"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy the ad name for Meta"
      className="flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <span className="truncate">{text}</span>
      {copied ? <Check className="h-3 w-3 shrink-0 text-success" /> : <Copy className="h-3 w-3 shrink-0" />}
    </button>
  );
}
