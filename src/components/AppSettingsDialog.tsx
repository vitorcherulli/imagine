"use client";

import * as React from "react";
import { Settings2 } from "lucide-react";
import { useAppTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { APP_THEME_OPTIONS } from "@/lib/app-theme";
import { cn } from "@/lib/utils";

export function AppSettingsDialog({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useAppTheme();
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={collapsed ? "icon-sm" : "sm"}
          title="Settings"
          className={
            collapsed
              ? "h-8 w-8 text-foreground/80"
              : "h-8 w-full justify-start gap-2 px-2 text-xs text-foreground/80"
          }
        >
          <Settings2 className="h-3.5 w-3.5" />
          {!collapsed && "Settings"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Appearance and editor preferences.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-2xs text-muted-foreground">Appearance</Label>
          <div className="grid gap-2">
            {APP_THEME_OPTIONS.map((option) => {
              const selected = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                      : "border-border bg-background hover:bg-muted/50",
                  )}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="mt-0.5 text-2xs text-muted-foreground">
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
