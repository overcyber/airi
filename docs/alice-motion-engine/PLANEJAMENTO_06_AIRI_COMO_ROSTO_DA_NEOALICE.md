# Planejamento 06 — O AIRI como rosto da NeoAlice

> Data: 05/11/2026. Substitui a ordem de trabalho da seção 7 do `STATUS_PLANOS_01_02_E_V1.md`.
> Os Planos 01 a 05 continuam válidos no que não contradizem este documento.

## 1. O que mudou

O objetivo do fork é **substituir o TalkingHead-NeoAlice** (módulo `MMM-AvatarMQTT` do MagicMirror) por um avatar AIRI. O avatar é o **rosto** da NeoAlice. O **cérebro** é um só: a NeoAlice (memória, personalidade, ações, LLM, STT e TTS dela).

O trabalho até aqui tratou o AIRI como um segundo assistente, com LLM, voz e audição próprios, e a NeoAlice só como uma fonte de humor e gestos. Isso estava errado para o objetivo. O resultado foi um avatar que respondia com o próprio LLM e não com a NeoAlice.

A partir deste plano:

- O modo padrão do fork é o **modo cérebro NeoAlice**: o AIRI não responde sozinho.
- Os provedores do AIRI (Ollama, NIM, Kokoro, Whisper) ficam como opção, não como caminho principal.
- A NeoAlice não muda até o avatar novo estar aprovado (regra do responsável). O AIRI se integra como mais um satélite, só com os tópicos que a NeoAlice já entende.

## 2. Contrato com a NeoAlice (confirmado em 05/11/2026)

Fonte: respostas do responsável, testadas na NeoAlice real (`AIRI-AVATAR_respostas`).

| Fluxo | Tópico ou rota | Sentido | Situação no AIRI |
| --- | --- | --- | --- |
| Fala da NeoAlice | `neoalice/v1/{site}/cmd/tts/audio` (`audio.b64`, WAV 24 kHz, 2,5 s de silêncio no início) | NeoAlice → avatar | Feito (S08). Toca com lip sync. |
| Texto para TTS local | `cmd/tts/say` | NeoAlice → avatar | Feito (S08), modo "airi-voice". |
| Parar a fala | `cmd/tts/stop` | NeoAlice → avatar | Feito (S08). |
| Humor | `evt/mood` (`{"mood": ...}`, sem intensidade) | NeoAlice → avatar | Feito (S08, V3). |
| Gestos, poses, emoji | `cmd/avatar/gesture`, `pose`, `emoji`, `animation` | NeoAlice → avatar | Feito (S08, V5). |
| Voz do usuário | `evt/audio` v1 canônico (WAV 16 kHz em `audio.b64`, `user_id`, `session_id`) | avatar → NeoAlice | Feito em 05/11. Uma frase por vez, espera de até 150 s. |
| Texto digitado | `evt/stt/final` v1 (`stt.text`) | avatar → NeoAlice | Feito em 05/11, no modo cérebro. |
| Estado do satélite | `evt/state` a cada 30 s | avatar → NeoAlice | Feito em 05/11. Desligado até o responsável autorizar. |
| Palavra de ativação | `evt/wake` (`wake.word`, `wake.confidence`) | avatar → NeoAlice | Feito em 06/11 (F2). A NeoAlice responde com `cmd/tts/stop`. |
| Visão | `evt/vision/detection(s)`, `evt/stt/final` do facialrecog | NeoAlice → avatar | Feito em 06/11 (F5). Só leitura. |
| HTTP `/audio` e `/chat` | API 8080 | — | Não serve para a voz: a resposta HTTP não traz áudio. Fica de fora. |

Regras do contrato:

- **Site próprio**: o avatar usa `airi-avatar`. O `cmd/tts/audio` vai para um site só. Com o site `magicmirror`, o espelho antigo e o avatar novo tocariam a mesma resposta.
- O AIRI só publica no próprio site, e só `evt/audio`, `evt/stt/final`, `evt/state` e `evt/wake`. O código recusa qualquer outro tópico.
- Latência medida na NeoAlice: 35 s (`/chat`), 70 s (`evt/stt/final` → `cmd/tts/audio`), até 115 s (`/audio`). O gargalo é o Whisper na CPU (porta 9100). O responsável recomenda o Whisper na NPU (porta 9200).

## 3. Arquitetura alvo

```text
                         broker MQTT da NeoAlice (1883 TCP, 1884 WebSocket)
                                   ^                     |
     evt/audio, evt/stt/final,     |                     |  cmd/tts/audio, cmd/tts/say,
     evt/state, evt/wake           |                     v  evt/mood, cmd/avatar/*
                        +--------------------------------------+
  microfone ----------> |  AIRI (Web no Docker, ou desktop)     |
  teclado (chat) -----> |  ponte NeoAlice = rosto da NeoAlice   | ----> avatar VRM com lip sync,
                        |  modo cérebro: o LLM do AIRI não fala |       humor, gestos e movimento
                        +--------------------------------------+
                                   |
                   Docker airi-web: HTTPS, /mqtt, /models, /airi-defaults.json
                                   |
                        MagicMirror: módulo MMM-AiriStage (iframe da página do palco)
```

## 4. Estado em 05/11/2026

Testado no navegador contra imitações da NeoAlice e dos serviços (não contra a NeoAlice real):

| Item | Resultado |
| --- | --- |
| Padrões do servidor (`/airi-defaults.json`) aplicados na primeira abertura | Passou |
| Botão "Load settings from the server" (substitui as configurações salvas) | Passou |
| Desktop: URL do servidor na tela da ponte, sem recompilar | Implementado |
| Microfone → `evt/audio` → `cmd/tts/audio` → avatar fala | Passou (3 ciclos) |
| Chat digitado → `evt/stt/final` → resposta no chat e na voz | Passou. Prova: `evidencias/D06/modo-cerebro-chat-neoalice.png` |
| Troca de modelo na Web (Eva, Neptuna, AvatarSample, Hiyori) | Passou. Um `.vrm` sem permissão de leitura dá 403. O `preparar.sh` corrige |
| "Empty color reference" na troca de modelo | Corrigido |

Não testado: a NeoAlice real, o desktop compilado, o MagicMirror com o AIRI e o Windows.

## 5. Fases, em ordem

### F1 — Validação com a NeoAlice real (próxima)

1. `.env` do Docker com o site `airi-avatar`, `AIRI_DEFAULT_NEOALICE_BRAIN=true`, `AIRI_DEFAULT_NEOALICE_SPEECH_MODE=neoalice-audio`, `AIRI_DEFAULT_NEOALICE_VOICE_INPUT=true`, `AIRI_MQTT_WS_UPSTREAM=<broker>:1884`.
2. Roteiro de aceite, com `mosquitto_sub -t 'neoalice/v1/airi-avatar/#' -v` aberto:
   - digitar "que horas são" → a NeoAlice responde em voz no avatar, e a resposta aparece no chat;
   - falar uma frase → `evt/audio` sai, a resposta toca;
   - publicar `evt/mood` e `cmd/avatar/gesture` no site → o avatar muda;
   - `cmd/tts/stop` → a fala para.
3. Registrar a latência de cada ciclo e as falhas em `evidencias/F1/`.

### F2 — Palavra de ativação e interrupção

- Hoje o microfone envia toda frase. A NeoAlice recomenda a palavra de ativação `alexa` (openWakeWord, limiar 0,6), como nos satélites.
- O AIRI tem um detector de palavra de ativação (`libs/voice/wake-word-detector.ts`). Avaliar se ele serve no navegador e sem internet. Senão, propor uma alternativa ao responsável antes de escolher uma biblioteca.
- Ao detectar a palavra: publicar `evt/wake`, cortar a fala local (interrupção) e abrir o microfone para uma frase.

Estado em 06/11/2026 (feito):

- A palavra é uma configuração da ponte ("Wake word") e do `.env` (`AIRI_DEFAULT_NEOALICE_WAKE_WORD=Eva`). Vazia, o microfone continua em escuta contínua.
- O detector do AIRI (`wake-word-detector.ts`) não foi usado. Ele baixa um modelo chinês e inglês do Hugging Face e depende do pipeline de voz do chat.
- No lugar dele, cada frase é transcrita pelo STT do módulo Hearing, que no Docker é o Whisper local (`AIRI_STT_UPSTREAM`). Não entrou nenhuma biblioteca nova.
- Frase que começa com "Eva" (ou "oi Eva"): a fala local para, sai `evt/wake`, e o resto da frase sai como `evt/stt/final`. "Eva" sozinha abre o microfone por 8 s. As outras frases são descartadas.
- Com a palavra ligada, o microfone também escuta enquanto o avatar fala. Por isso a palavra interrompe a fala.
- Teste no navegador, com microfone e STT falsos: uma fala de 25 s parou depois de 3,25 s, no mesmo milissegundo do `evt/wake`. O `evt/stt/final` levou "que horas são?".

### F3 — Página do espelho

- O `MMM-AiriStage` mostra a página inteira do AIRI num iframe, com chat e botões. O espelho precisa de uma página só do palco: fundo transparente, sem interface, com a ponte e o microfone.
- Criar a rota `/mirror` no `stage-web`, com o palco, a ponte NeoAlice e nada mais.
- Medir FPS, CPU e memória na máquina do espelho contra o TalkingHead atual. Critério: não pode ser mais pesado que o TalkingHead.

### F4 — Desempenho

- Medir o custo por quadro das camadas V1 a V5 e desligar o que pesar mais que o ganho.
- Detectar a perda do contexto WebGL e mostrar um aviso, em vez de quebrar a página.

Estado em 06/11/2026: `/mirror?stats=1` mostra o fps e a média de cada camada do VRM a cada 5 s, na tela e no console (`[mirror-stats]`). A medição no computador do espelho é do responsável. A perda do contexto WebGL já tem aviso.

### F5 — Visão

- Reagir a `evt/vision/detection` (pessoa detectada → o avatar olha e cumprimenta) e à saudação do facialrecog.
- Só leitura. Nenhuma mudança na NeoAlice.

Estado em 06/11/2026 (feito):

- A ponte lê `neoalice/v1/+/evt/vision/detection` (forma do core, `detection.objects[].class`), `neoalice/v1/+/evt/vision/detections` (forma do satélite, `detections[].class_name`) e `neoalice/v1/facialrecog/evt/stt/final`.
- Uma pessoa que chega depois de 60 s sem ninguém, ou uma saudação do facialrecog, faz o avatar sorrir e acenar. O intervalo mínimo entre dois cumprimentos é de 10 s.
- A opção "React to the NeoAlice cameras" fica na página da ponte e começa ligada.
- Teste no navegador: uma pessoa em `vision-entrada` levou o `happy` a 0,7, e o aceno tocou.

### F6 — Troca do espelho (S16)

Critérios para trocar o `MMM-AvatarMQTT` pelo `MMM-AiriStage`:

1. F1 passou com a NeoAlice real.
2. F3 passou: a página `/mirror` roda no espelho sem internet e não pesa mais que o TalkingHead.
3. O responsável aprovou o avatar.

Só depois disso: humor com intensidade (exige mudar a NeoAlice) e o fim de turno explícito (Plano 03, `PROMPT_BACKEND_FIM_DE_TURNO_E_HUMOR.md`).

### Adiadas

As sprints V6, S09 e S10 a S14 do Plano 03 continuam válidas, mas ficam depois da F6. Elas melhoram o avatar, mas não ajudam a substituir o TalkingHead.

## 6. Decisões pendentes do responsável

| # | Decisão | Padrão até a resposta |
| --- | --- | --- |
| 1 | Ligar o `evt/state` (o avatar aparece em `/satellites/active` e recebe avisos gerais) | Desligado |
| 2 | Palavra de ativação ou escuta contínua | Escuta contínua, uma frase por vez |
| 3 | Modo cérebro ligado por padrão no `.env.example` | Desligado no exemplo. Ligado no `.env` recomendado |
| 4 | Usar o Whisper na NPU (9200) | Recomendado no `.env` |
