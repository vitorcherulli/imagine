import { applyChatEdit } from "@/lib/motion/server";
import type { MotionProps } from "@/lib/motion/types";

const props: MotionProps = {
  tag: "NOVIDADE",
  title: "Sua marca em *movimento*",
  subtitle: "Crie peças animadas em minutos.",
  cta: "COMEÇAR AGORA",
  logoUrl: "",
  primary: "#5AD1C4",
  accent: "#8FF0DE",
  bg: "#081A1D",
  duration: 8,
};

async function main() {
  const r = await applyChatEdit({
    templateId: "bold-intro",
    props,
    history: [],
    message: "troca as cores para azul royal e branco, e deixa o título mais agressivo sobre ganhar dinheiro",
  });

  console.log("REPLY:", r.reply);
  console.log("PROPS:", JSON.stringify(r.props, null, 2));
}

main().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
