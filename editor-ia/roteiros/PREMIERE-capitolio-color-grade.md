# Color grade — Capitólio (Steve McCurry) no Premiere

Guia prático para o projeto **Capitólio IA 2026** com look inspirado em Steve McCurry (Kodachrome, National Geographic).

## Antes de começar

1. Abra `E:\Vídeos\2017\Capitólio Mar de Minas\Capitólio IA 2026.prproj`
2. Copie o LUT para o PC (se ainda não estiver no disco E:):

   ```
   imagine/editor-ia/color/steve-mccurry-capitolio.cube
   → E:\Vídeos\2017\Capitólio Mar de Minas\Arquivos\steve-mccurry-capitolio.cube
   ```

3. Trabalhe na sequência **Capitólio — Attenborough IA 2026** (ou equivalente)

---

## Passo a passo (5 min)

### 1. Camada de ajuste

- Timeline → botão direito → **New Item → Adjustment Layer**
- Arraste para **V2** (acima do vídeo), cobrindo **toda** a sequência
- Duração = duração do corte (~2 min 20 s)

### 2. Lumetri Color

- Selecione a adjustment layer
- **Effects** → **Lumetri Color** (arraste uma vez só)

### 3. Input LUT

- Painel **Color** → **Basic Correction**
- **Input LUT** → Browse → `steve-mccurry-capitolio.cube`
- Intensidade: comece em **100%**; se ficar forte demais, baixe para **75–85%**

### 4. Ajuste fino (por cima do LUT)

| Controle | Valor inicial |
|----------|----------------|
| Temperature | **+13** |
| Tint | **+2** |
| Exposure | **+0.10** |
| Contrast | **+26** |
| Highlights | **−32** |
| Shadows | **+20** |
| Whites | **−18** |
| Blacks | **+7** |
| Vibrance | **+22** |
| Saturation | **+6** |

### 5. Creative

| Controle | Valor |
|----------|-------|
| Faded Film | **10** |
| Sharpen | **15** |

### 6. Curves (RGB)

Curva em **S** suave — não deixe preto em 0 nem branco estourado em 1.

### 7. Verificação

- **Lumetri Scopes** → Waveform: picos abaixo de 100 IRE
- Reproduza trechos com **água** e **pedra** — água profunda, rocha quente
- Áudio Attenborough ligado — o grade deve “calmar”, não competir

---

## Exceções por tipo de shot

| Shot | Ajuste |
|------|--------|
| Interior de cânion (escuro) | Exposure **−0.10** só nesse clip, ou máscara |
| Água muito cyan | HSL → Aqua: Sat **−5** |
| Céu estourado | Highlights **−30**, Whites **−15** |
| `inicio` clips | Mesmo grade — coerência |

---

## Salvar preset (reutilizar)

1. Lumetri → menu **⋮** → **Save Preset**
2. Nome: `McCurry Capitólio IA 2026`
3. Marque **Include Input LUT** se quiser preset completo

Preset fica em `Documents/Adobe/Common/Lumetri/Presets/` (Windows).

---

## O que NÃO fazer

- Não empilhar 3 LUTs diferentes
- Não usar **Creative Look** genérico “Teal & Orange” por cima
- Não Saturation acima de **+20** com LUT já aplicado
- Não exportar antes de ver no monitor (não só no preview baixo)

---

## Regenerar o LUT

```bash
cd ~/imagine/editor-ia
python3 scripts/generate-mccurry-lut.py
```

Prompt completo para IA: `roteiros/PROMPT-steve-mccurry-color.md`
