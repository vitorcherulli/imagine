# Prompt — Edição estilo Watchtower of Turkey (Leonardo Dalessandri)

Referência: [Watchtower of Turkey](https://www.youtube.com/watch?v=z7yqtW4Isec) (3:33, Vimeo Best 2014)  
Autor: **Leonardo Dalessandri** — não confundir com “Attenborough documentário”.

---

## O que é esse estilo

Um **fluxo contínuo de impressões visuais**, cortado **no ritmo da música** — não um documentário narrado.

> *"I want the viewer to perceive my edit as one continuous flow of impressions and movements, cut on the rhythm of the music."* — Dalessandri

| Attenborough (Capitólio atual) | Watchtower (Turkey) |
|-------------------------------|---------------------|
| Narração longa guia o filme | **Música guia** o filme |
| Cortes 6–13 s, pausado | **~280 cortes em 3:30** (~1–4 s cada) |
| Tom observacional | Tom **emocional / sensorial** |
| Voz masculina documentário | VO **curta** no início (opcional) + SFX ambiente |
| Cor McCurry quente | Cor **unificada**, presets consistentes |
| Drone plano a plano | **Match cuts** (cor, movimento, ação) |

---

## Regras de edição (prompt para IA ou editor)

### 1. Música primeiro
- Escolher trilha **antes** de cortar (referência: Ludovico Einaudi — *Experience*).
- Piano + orquestra, build emocional, clímax no meio/final.
- Cortes alinhados a **batidas e frases musicais**, não a parágrafos de texto.
- Música em **100%**; ducking só se houver VO curta.

### 2. Ritmo de cortes
- Duração alvo: **3:00 – 3:40**.
- **40–80 cortes** (com footage limitado; original Turkey ≈ 280).
- Abertura: planos **4–5 s** (respirar).
- Meio: **2–4 s** (energia).
- Clímax (cânion/barco/lagoa): **1.5–3 s** (mais cortes).
- Encerramento: **1 plano longo 5–8 s** ou fade em música.

### 3. Match cuts (prioridade)
Cortar quando dois planos consecutivos compartilham:
- **Cor dominante** (turquesa da água → turquesa de outra cena)
- **Direção de movimento** (drone avançando → drone avançando)
- **Escala** (wide → wide, detail → detail)
- **Brilho** (highlight similar na transição)

Evitar: wide → macro sem ponte; corte em meio de pan brusco.

### 4. Movimento contínuo
- Preferir trechos **estáveis** com movimento fluido (forward, orbit, reveal).
- Speed ramp: **80% lento** em reveals; **120%** em transições energéticas (com moderação).
- Nunca usar trecho com **tremida de drone**.

### 5. Som
- Trilha principal em A1 (ou A2 se houver VO).
- **SFX ambiente** pontuais: água, vento, remo (se disponível) — 10–20% volume.
- Sem narração longa. VO opcional: **1 frase** no início (*"This is Capitólio..."*).

### 6. Cor
- Look **unificado** em todos os clipes (mesmo LUT / Lumetri).
- Saturação moderada-alta; highlights controlados.
- Minas Gerais: **dourado + turquesa da água**, não teal frio.

### 7. Estrutura narrativa visual (sem texto)
1. **Intro** — vinheta / paisagem ampla  
2. **Estabelecimento** — reservatório, vastidão  
3. **Cânion** — paredes, escala  
4. **Água** — quedas, piscinas, cor  
5. **Clímax** — barco, lagoa azul, canyon 40 m  
6. **Outro** — silêncio visual, logo ou paisagem final  

---

## Prompt curto (copiar para IA)

```
Edit a 3:20 travel film in the style of Leonardo Dalessandri's "Watchtower of Turkey".

Music-driven: piano and orchestral emotional build (like Ludovico Einaudi Experience).
Cut on the beat. 40-60 short clips (2-4 seconds average), one continuous visual flow.
Use match cuts: match water color, drone direction, and brightness between shots.
No long documentary narration — optional 5-second voice intro only.
Brazilian canyon lake Capitólio: golden hour warmth, turquoise water, drone aerials.
Stable footage only — no shake. Speed ramps subtle. Unified color grade.
Structure: intro → reservoir wide → canyon walls → waterfalls → boat climax → blue lagoon → outro hold.
Sound design: music 100%, subtle water/wind SFX accents.
```

---

## Limitações com footage Capitólio

O Watchtower original foi **filmado para a edição** (movimentos combinados, 3500 km, GH3+GoPro, pessoas, hyperlapse).

Com **52 clipes drone 2017**:
- Dá para **inspirar** o ritmo e a música, não clonar 280 match cuts.
- Match cuts limitados a **cor da água / céu / direção do drone**.
- Resultado: **Watchtower-inspired**, não réplica pixel a pixel.

---

## Arquivos gerados por `capitolio-watchtower-edit.py`

- Sequência Premiere: `Capitólio V2 — Watchtower Minas`
- Música: `Audio/Musica Watchtower Capitólio V2.mp3`
- Notas: `Docs/TIMELINE-WATCHTOWER.md`
