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

## 5. O que eu proponho (não foi feito)

1. **Campo para criar a wake word** na página Hearing, Wake words, em vez de depender do LLM. Aceitar texto simples, e converter para fonemas ou pinyin com um dicionário, ou deixar o usuário editar os fonemas.
2. **Oferecer `configure_wake_words` também no modo cérebro da NeoAlice**, ou tirar a ferramenta do chat e usar o campo do item 1.
3. **Escuta contínua no APK** com um interruptor claro e um aviso de bateria, e uma notificação do sistema enquanto escuta. Só depois disso a wake word do AIRI faz sentido no celular.
4. **Mostrar o motivo** quando a wake word não roda: "sem wake word criada", "escuta desligada" e "sem provedor de transcrição". Hoje o motivo fica escondido.
5. **Wake word da NeoAlice no celular:** a opção mais barata. Basta uma lista de verificação na página da ponte NeoAlice que mostre quais dos itens 1 a 3 faltam.

## 6. O que esta análise não prova

- Não rodei o detector aqui: o modelo KWS vem do Hugging Face, e este ambiente não alcança o site.
- Não testei no seu aparelho. Se você me disser qual estado a página Wake words mostra e se o modo cérebro está ligado, eu confirmo qual causa é a sua.
