import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import { createId } from "@paralleldrive/cuid2";
import { tryUser } from "@/lib/auth";
import { getOwnedMotionDesign, parseProps, updateMotionDesign } from "@/lib/motion/server";
import { saveBuffer } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Bundle do Remotion é carregado uma vez e reutilizado entre renders.
let bundlePromise: Promise<string> | null = null;

/**
 * Garante que o Chrome headless encontre as libs NSS (nss/nspr).
 * Usa as libs locais em .libs/ quando existirem (ambientes sem libnss3 no sistema).
 */
function ensureBrowserLibs(): void {
  const libs = path.join(process.cwd(), ".libs", "root", "usr", "lib", "x86_64-linux-gnu");
  const nss = path.join(libs, "nss");
  if (!fsSync.existsSync(path.join(libs, "libnspr4.so"))) return;
  process.env.LD_LIBRARY_PATH = [libs, nss, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
}

async function getServeUrl(): Promise<string> {
  if (!bundlePromise) {
    const { bundle } = await import("@remotion/bundler");
    const entryPoint = path.join(process.cwd(), "src", "remotion", "index.ts");
    bundlePromise = bundle({
      entryPoint,
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          alias: {
            ...(config.resolve?.alias ?? {}),
            "@": path.join(process.cwd(), "src"),
          },
        },
      }),
    }).catch((err) => {
      bundlePromise = null;
      throw err;
    });
  }
  return bundlePromise;
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwnedMotionDesign(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const props = parseProps(row.props, row.templateId);
  const inputProps = { ...props, templateId: row.templateId };

  try {
    const { renderMedia, selectComposition, ensureBrowser } = await import("@remotion/renderer");
    ensureBrowserLibs();
    await ensureBrowser();
    const serveUrl = await getServeUrl();

    const composition = await selectComposition({
      serveUrl,
      id: row.templateId,
      inputProps,
    });

    const outFile = path.join(os.tmpdir(), `motion-${createId()}.mp4`);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outFile,
      inputProps,
    });

    const buf = await fs.readFile(outFile);
    const url = await saveBuffer(row.id, null, `motion-${Date.now()}.mp4`, buf);
    await fs.rm(outFile, { force: true }).catch(() => undefined);

    await updateMotionDesign(row.id, { outputUrl: url, status: "ready" });
    return NextResponse.json({ ok: true, outputUrl: url });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[motion/render]", detail);
    await updateMotionDesign(row.id, { status: "error" }).catch(() => undefined);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
