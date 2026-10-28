import path from "node:path";

const inputProps = {
  templateId: "bold-intro",
  tag: "TESTE",
  title: "Isso é um *teste* de motion",
  subtitle: "Renderizando via Remotion no servidor",
  cta: "VER AGORA",
  logoUrl: "",
  primary: "#5AD1C4",
  accent: "#8FF0DE",
  bg: "#081A1D",
  duration: 4,
};

async function main() {
  const libs = path.join(process.cwd(), ".libs", "root", "usr", "lib", "x86_64-linux-gnu");
  const nss = path.join(libs, "nss");
  process.env.LD_LIBRARY_PATH = [libs, nss, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition, ensureBrowser } = await import("@remotion/renderer");

  console.log("ensureBrowser…");
  await ensureBrowser();

  console.log("bundle…");
  const entryPoint = path.join(process.cwd(), "src", "remotion", "index.ts");
  const serveUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: { ...(config.resolve?.alias ?? {}), "@": path.join(process.cwd(), "src") },
      },
    }),
  });
  console.log("serveUrl:", serveUrl);

  const composition = await selectComposition({ serveUrl, id: inputProps.templateId, inputProps });
  console.log("composition:", composition.width, composition.height, composition.durationInFrames);

  const out = path.join(process.cwd(), "out-motion-test.mp4");
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: out, inputProps });
  console.log("OK ->", out);
}

main().catch((err) => {
  console.error("FALHOU:", err);
  process.exit(1);
});
