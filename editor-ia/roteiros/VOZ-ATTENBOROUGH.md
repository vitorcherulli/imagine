# Voz Attenborough — qual escolher?

Sir David Attenborough não é voz **grave profunda**. É **barítono médio**, calmo, britânico, preciso — mais “narrador de documentário” que “trailer de filme”.

## Kokoro 82M (só vozes americanas — nenhuma é britânica de verdade)

| Voz | Parecido? | Por quê |
|-----|----------|---------|
| **Adam (narrator M)** | **Melhor opção Kokoro** | Feita para narração; tom médio, pausado, autoridade sem boom |
| George (deep M) | Fraco | Grave demais — lembra Morgan Freeman/trailer, não Attenborough |
| Michael (dramatic M) | Não | Teatral/dramático demais |

**Recomendação Kokoro:** `Adam (narrator M)` · speed **0.88–0.90**

## Gemini 3.1 Flash TTS (se puder trocar o modelo)

| Voz | Parecido? | Por quê |
|-----|----------|---------|
| **Sadaltager (Knowledgeable)** | **Melhor Gemini** | Tom informativo/documentário — o nome já diz |
| Charon (Informative) | Muito bom | Calmo, claro, estilo BBC doc |
| Gacrux (Mature) | Bom | Mais “voz madura”; use se quiser Attenborough mais velho |
| Algenib (Gravelly) | Cuidado | Textura interessante, mas pode ficar áspero |

**Recomendação Gemini:** `Sadaltager` ou `Charon` · speed **0.90**

## No Capitólio (gerado)

Arquivo: `E:\...\Arquivos\Audio\Narracao Attenborough IA 2026.mp3`  
**Voz:** Gemini **Sadaltager** · speed **0.88** · modelo `google/gemini-3.1-flash-tts-preview`

Também salvo `.wav` na mesma pasta (qualidade máxima no Premiere).

Regenerar:

```bash
cd ~/imagine/editor-ia
export $(grep -v '^#' ../.env.local | xargs)
python3 scripts/capitolio-attenborough-tts.py
```
