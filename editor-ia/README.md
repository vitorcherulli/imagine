# editor-ia

Experimento **à parte** do app Imagine — edição de vídeo no Premiere com IA (roteiro Attenborough, TTS, corte automático no `.prproj`).

Não faz parte do fluxo do app web; scripts e roteiros ficam só aqui.

## Estrutura

```
imagine/editor-ia/
├── README.md
├── .env.example          # OPENROUTER_API_KEY (só para gerar narração)
├── color/
│   └── steve-mccurry-capitolio.cube   # LUT McCurry → Lumetri
├── scripts/
│   ├── capitolio-attenborough-edit.py
│   ├── capitolio-attenborough-tts.py
│   ├── generate-mccurry-lut.py
│   └── apply-mccurry-lumetri-prproj.py   # aplica Lumetri no .prproj
└── roteiros/
    ├── PROMPT-attenborough-narration.md
    ├── PROMPT-steve-mccurry-color.md      # prompt colorista / IA
    ├── PREMIERE-capitolio-color-grade.md  # passo a passo Premiere
    └── capitolio-mar-de-minas/
        ├── youtube-en.md
        └── narration-attenborough.txt
```

## Projeto Premiere (mídia — fora desta pasta)

| O quê | Onde |
|-------|------|
| Projeto editado | `E:\Vídeos\2017\Capitólio Mar de Minas\Capitólio IA 2026.prproj` |
| Backup | `...\Capitólio IA 2026.prproj.bak` |
| Narração gerada | `...\Arquivos\Audio\Narracao Attenborough IA 2026.mp3` |
| LUT McCurry | `...\Arquivos\LUT\steve-mccurry-capitolio.cube` |

## Color grade (McCurry)

Ver `roteiros/PREMIERE-capitolio-color-grade.md` — adjustment layer + Lumetri + LUT.

Prompt para IA colorista: `roteiros/PROMPT-steve-mccurry-color.md`

## Uso

```bash
cd ~/imagine/editor-ia
cp .env.example .env   # coloque OPENROUTER_API_KEY

# 1) Gerar narração TTS (Kokoro / am_adam)
python3 scripts/capitolio-attenborough-tts.py

# 2) Aplicar corte documentário + trocar áudio no Premiere
python3 scripts/capitolio-attenborough-edit.py
```

Abra o `.prproj` no Premiere e exporte quando quiser.

## Imagine → Premiere (manifest)

Fluxo com o **Script Studio** do app Imagine (camada 1 + 2):

1. No Imagine: gere narração por parágrafo → **Export for Premiere** → `manifest.json` + **Download MP3** (`Narracao.mp3`).
2. No PC (WSL ou terminal), com `ffprobe` no PATH e um `.prproj` template que já tenha os clips importados:

```bash
cd ~/imagine/editor-ia

# Opção A — tudo de uma vez
python3 scripts/imagine-manifest-to-premiere.py \
  --manifest ~/Downloads/capitolio-manifest.json \
  --footage "/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Videos" \
  --template "/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Antigos/Capitólio IA 2026.prproj" \
  --output "/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Capitólio Imagine.prproj" \
  --win-base "E:\Vídeos\2017\Capitólio Mar de Minas" \
  --audio "/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Audio/Narracao.mp3" \
  --scores data/capitolio-v2-scores.json

# Opção B — em dois passos
python3 scripts/imagine-match-manifest.py \
  --manifest manifest.json --footage /path/to/Videos --output manifest-matched.json

python3 scripts/imagine-build-prproj.py \
  --manifest manifest-matched.json \
  --template template.prproj --output project.prproj \
  --win-base "E:\YourProject" --audio /path/to/Narracao.mp3
```

O matcher preenche `clip.file`, `inSec`, `outSec` e gera `timeline[]` no JSON. O build coloca V1 nos `startSec` do manifest e A1 com a narração.

| Script | Função |
|--------|--------|
| `imagine-match-manifest.py` | Keywords + scores → escolhe takes locais |
| `imagine-build-prproj.py` | Manifest matched → `.prproj` |
| `imagine-manifest-to-premiere.py` | Os dois passos acima |
