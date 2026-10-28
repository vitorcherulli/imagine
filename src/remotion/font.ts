import { loadFont } from "@remotion/google-fonts/Montserrat";

// Carrega a fonte só onde há DOM (browser / Chrome headless do render).
// No SSR do Next não há `document`, então usamos a família como fallback.
const loaded =
  typeof document !== "undefined"
    ? loadFont("normal", { weights: ["500", "600", "700", "800", "900"], subsets: ["latin"] })
    : { fontFamily: "Montserrat, sans-serif" };

export const MOTION_FONT = loaded.fontFamily;
