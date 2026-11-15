# Planejamento 19 — Por que a wake word não funciona (Tamagotchi e APK)

**Data:** 15/11/2026. **Tipo:** análise do código. Nada foi alterado no app.

## 1. Existem duas wake words

| | AIRI (Sherpaw KWS) | NeoAlice (texto) |
| --- | --- | --- |
| O que é | Um modelo local detecta a palavra no áudio do microfone | O app transcreve cada frase e procura a palavra no começo do texto |
| Onde fica | `packages/stage-ui/src/libs/voice/*`, `stores/wake-word-detection.ts` | `packages/alice-motion/src/wake-word.ts`, `use-neoalice-stage-bridge.ts` |
| Onde se configura | Na **ficha do personagem**, pela ferramenta `configure_wake_words` do LLM | Campo "wake word" da ponte NeoAlice, por exemplo `Eva, Ewa` |
| Precisa de | Modelo `kwsModel` (embutido), microfone, escuta contínua, STT para o que vem depois | "Microfone do avatar" ligado, provedor de transcrição em Hearing |

O recurso **existe** nos dois apps. O modelo KWS é embutido no Tamagotchi (`electron.vite.config.ts:339-341`) e no APK (`stage-pocket/vite.config.ts:131-135`).

## 2. Por que a wake word do AIRI não funciona

### 2.1 Não há como criar uma wake word no seu modo de uso (afeta os dois apps)

- A lista de wake words sai de `card.extensions.airi.wakeWords`. Uma ficha nova **não tem nenhuma**. Sem wake word, o detector fica em `unconfigured` e nunca abre o modelo (`wake-word-detection.ts`).
- A página Configurações, Módulos, Hearing, Wake words (`wake-words.vue`) **só mostra** o estado. Não tem campo para criar ou editar.
- A única forma de criar é pedir ao personagem no chat. Ele chama a ferramenta `configure_wake_words`, com a pronúncia em fonemas ARPAbet (inglês) ou pinyin (chinês). Essa ferramenta só é oferecida em `executeSend` (`stores/chat.ts:1374`).
- **Só que** com o "modo cérebro da NeoAlice" ligado, o envio vai por outro caminho: `send()` chama `sendToNeoAlice` (`chat.ts:1474`) e nunca passa por `executeSend`. Então o LLM do AIRI não responde e a ferramenta nunca existe. Resultado: **nenhuma wake word pode ser criada**, e a detecção nunca liga.
- O modelo é bilíngue **chinês e inglês**. Português não existe nele. Um nome como "Eva" ou "Alice" tem de ser escrito em fonemas ingleses, e a própria documentação diz que nomes ingleses são frágeis (ADR `2026-10-12-detect-wake-words-in-unprocessed-audio.md`).

### 2.2 Tamagotchi (desktop)

Se existir uma wake word na ficha, o desktop liga o detector: `useVoiceListening()` roda na página principal (`renderer/pages/index.vue:667`). As condições para detectar são:

1. Hearing ligado e o microfone do AIRI ligado.
2. Modo de entrada `always-on` ou `wake-word`. O modo `push-to-talk` não escuta.
3. Ao menos uma pronúncia ativa. Se duas fichas usam a mesma, ela fica **pausada** até você escolher o dono.
4. Um provedor de transcrição em Hearing, para o que você fala depois da wake word.

Então, no Tamagotchi, o item 2.1 é a causa mais provável. Se você já tem uma wake word criada, a página Wake words mostra o estado de cada pronúncia: `ativa`, `pausada`, `de outro personagem` ou `sem suporte`.

### 2.2.1 Ressalva

O ADR de 12/10/2026 registra que, no Tamagotchi, chamadas ao vivo não acordavam o personagem. A correção foi: microfone sem processamento do navegador, uma nova sequência do detector a cada pausa, e ajustes de busca. Isso já está no código, mas o ADR admite falsos positivos e falhas com nomes ingleses.

### 2.3 APK Android: nunca roda, por desenho

`apps/stage-pocket/src/pages/index.vue:68`:

```ts
useVoiceListening({ continuous: () => !isMobile.value })
```

`isMobile` é `breakpoints.smaller('md')`, isto é, largura menor que 768 px. Um celular em pé tem 360 a 430 px, então `continuous()` é sempre `false`. Em `voice-input-mode.ts:38`, a escuta só liga se `callActive` ou `continuous()` for verdadeiro. Resultado:

- Fora de uma **chamada de voz**, o celular **nunca escuta**, e o detector de wake word nunca começa.
- Dentro de uma chamada de voz, o app já está escutando tudo, então a wake word perde o sentido.
- Só um tablet na horizontal (768 px ou mais) liga a escuta contínua.

Foi uma decisão de produto: o ADR `2026-10-29-web-voice-composer-and-call.md` diz que a tela pequena não tem controle para a escuta contínua, e só a chamada escuta. Por isso, **a wake word do AIRI não funciona no APK, mesmo bem configurada**.

## 3. Por que a wake word da NeoAlice (texto) não funciona

Ela existe, mas depende de várias coisas, e cada uma que falha só aparece como um erro pequeno:

1. O interruptor "microfone do avatar" (`voiceInput`) precisa estar ligado. Só o **primeiro palco montado** escuta (`mountedStages[0]`).
2. O campo da wake word precisa ter texto. Com o campo vazio, cada frase vai direto à NeoAlice, sem wake word.
3. Precisa de **provedor e modelo de transcrição** em Hearing. Sem isso o erro é `The wake word needs a transcription provider and model in Settings, Hearing` (`use-neoalice-phrase-transcriber.ts:26`). A transcrição acontece no servidor (Whisper), então precisa do endereço do servidor (Planejamento 13).
4. A transcrição precisa escrever a palavra como está no campo. O texto é normalizado (sem acento e minúsculo), mas "Eva" pode sair "Ewa" ou "Ava". Ponha as grafias separadas por vírgula.
5. A palavra tem de abrir a frase, com no máximo uma saudação antes (`oi Eva`). Uma wake word no meio da frase não conta (`wake-word.ts:44`).
6. A frase só passa pelo detector quando termina: o app transcreve **depois** da pausa. Não há detecção instantânea.

No APK, o caminho da NeoAlice não depende da largura da tela: o microfone é aberto pelo `NeoAliceMicrophone` (`getUserMedia`). Portanto, **é a wake word que dá para usar no celular hoje**, se o item 3 estiver certo.

## 4. Resumo

| App | Wake word do AIRI | Wake word da NeoAlice |
| --- | --- | --- |
| Tamagotchi | Existe. Sem criar a wake word na ficha, nada acontece. No modo cérebro da NeoAlice, ela **não pode ser criada**. | Existe. Precisa de microfone do avatar, campo preenchido e transcrição. |
| APK | **Desligada por desenho** em telas menores que 768 px. | Existe, e é a opção viável. Precisa dos mesmos itens. |

## 5. O que foi feito depois da análise

### 5.1 Qual engine serve para o português

O modelo local de wake word (`sherpa-onnx-kws-zipformer-zh-en-3M`) só conhece sons de **inglês e chinês**. Não há modelo de português nele, e os modelos de transcrição locais do app também não têm português. Quem entende português hoje é o **Whisper do servidor Alice**.

Por isso:

- **No celular e para nomes em português, a wake word da NeoAlice** (texto, pelo Whisper) é o caminho confiável. Ela não depende do tamanho da tela. Ganhou uma lista de verificação (5.4).
- **A wake word do AIRI** (modelo local) ficou utilizável: dá para criar a palavra, a pronúncia é sugerida, e a escuta no celular pode ser ligada. Um nome em português é escrito com os sons ingleses mais próximos. Isso **não foi testado com o modelo**, porque este ambiente não alcança o Hugging Face. Confira a sugestão e ajuste.
- **Um engine novo** (por exemplo Vosk em português ou Picovoice Porcupine) exigiria uma dependência nova e baixar um modelo. O `AGENTS.md` do projeto pede que você escolha a biblioteca antes. Eu não consegui baixar nem testar nenhum modelo aqui. A comparação está na seção 7.

### 5.2 Campo para criar a wake word

Na página Configurações, Módulos, Hearing, Wake words, cada personagem ganhou:

- campo da palavra, botão **Sugerir pronúncia**, caixa da pronúncia (uma por linha, editável) e **Adicionar wake word**;
- botão **Remover** em cada palavra.

Não depende mais do LLM, então funciona também com o modo cérebro da NeoAlice. O código valida cada som contra o vocabulário do modelo e recusa o que não existe.

`wake-word-pronunciation.ts` sugere os sons a partir da grafia, com regras do português (`ch`, `lh`, `nh`, `c` e `g` suaves, `l` final como `w`, acento e regra da sílaba tônica) e uma segunda sugestão com `L` no lugar de `R`. Exemplos testados: `Eva` dá `EH1 V AH0`, `Alice` dá `AH0 L IY1 S IY0`.

### 5.3 Por que não roda, na tela

A mesma página mostra uma lista "Por que a wake word pode não funcionar", lida do estado real do app: sem wake word, Hearing desligado, microfone desligado, escuta desligada, modo Push to Talk, tela pequena, sem provedor de transcrição, pronúncia em conflito e erro do detector. Cada linha diz o que fazer.

### 5.4 Wake word da NeoAlice

A página da ponte NeoAlice ganhou a lista: conectada ao broker, microfone do avatar ligado, campo preenchido, provedor de transcrição e o erro do microfone.

### 5.5 Escuta no celular

Nova chave "Escutar o tempo todo em tela pequena" na página Wake words (desligada por padrão). Ela vale no APK e na web em tela pequena (`useSmallScreenListeningStore`). Com ela ligada, o celular mantém o microfone aberto **enquanto o app está na frente**. O sistema para o microfone quando o app vai para o segundo plano, e o uso de bateria é maior.

### 5.6 Testes

- `wake-word-pronunciation.test.ts` (7) e `wake-word-diagnostics.test.ts` (9).
- `wake-words.browser.test.ts`: criar uma wake word com a sugestão e confirmar que a ficha guarda, a outra palavra fica, e a lista mostra "sem wake word".

## 6. O que isto não prova

- Não rodei o detector aqui: o modelo KWS vem do Hugging Face, e este ambiente não alcança o site. **Que a pronúncia sugerida seja reconhecida pelo modelo não foi provado.**
- Não testei no seu aparelho. Se você me disser qual estado a página Wake words mostra e se o modo cérebro está ligado, eu confirmo qual causa é a sua.

## 7. Comparação de engines, se a wake word local precisar entender português

| Engine | Português | Offline no navegador e no APK | Custo e licença | Risco |
| --- | --- | --- | --- | --- |
| Modelo atual (sherpa-onnx KWS zh-en) | Não, só fonemas ingleses e pinyin | Sim, já embutido | Livre | Nome em português é aproximado |
| Whisper do servidor (caminho da NeoAlice) | Sim | Precisa do servidor | Livre, já existe | Atraso: transcreve depois da pausa |
| Vosk, modelo `small-pt` | Sim, com gramática de palavras-chave | Sim, WebAssembly, uns 30 MB | Apache 2.0 | Dependência nova, modelo a baixar, desempenho no celular a medir |
| Picovoice Porcupine | Sim, palavra treinada no console deles | Sim | Chave de acesso, com plano grátis limitado | Conta e chave, e licença de uso |

Eu não escolho uma dessas por você sem poder testar. Se você quiser um engine novo, diga qual, e eu implemento com testes.
