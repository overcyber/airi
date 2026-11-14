# Planejamento 11 — Contrato da NeoAlice com o avatar AIRI: estados, modo noite e olhar

**Data:** 14/11/2026
**Branch:** `claude/plano-11-estados-olhar`, criado a partir da `main` com o merge do branch `claude/bold-einstein-8ye9r5`.
**Backup antes da mudança:** a tag `backup/antes-plano-11` e o arquivo `airi-backup-282124f.bundle`, entregue ao responsável.

Este documento diz o que a NeoAlice publica, o que o AIRI faz com cada mensagem, e o que falta a NeoAlice publicar para os outros estados funcionarem. A regra de bloqueio do `JUSTIFICATIVA_ALTERACOES_NEOALICE.md` continua: nenhum código da NeoAlice foi alterado. O AIRI já aceita o contrato novo, então nada quebra antes de a NeoAlice mudar.

Nas tabelas, `<site>` é o site do espelho. Por padrão é `magicmirror`. Os exemplos usam o IP de documentação `192.0.2.10`: troque pelo IP do seu broker.

## 1. O que o AIRI lê hoje

A ponte do AIRI só escuta. Ela nunca publica nesses tópicos. Fonte: `neoAliceBridgeTopics` e `NeoAliceTranslator` em `packages/alice-motion/src/neoalice-bridge.ts`.

| Tópico | Payload | O que a avatar faz |
| --- | --- | --- |
| `neoalice/v1/<site>/cmd/tts/say` | `{"text": "Oi", "lang": "pt-BR"}` | Sintetiza e fala, com lip sync e legenda. |
| `neoalice/v1/<site>/cmd/tts/audio` | `{"tts": {"text": "Oi"}, "audio": {"b64": "..."}}` | Fala o áudio pronto, com lip sync e legenda. |
| `neoalice/v1/<site>/cmd/tts/stop` | `{}` | Para a fala. |
| `neoalice/v1/<site>/evt/mood` ou `cmd/evt/mood` | `{"mood": "happy", "intensity": 0.8}` | Muda o rosto e o corpo. Ver a seção 2. |
| `neoalice/v1/<site>/cmd/avatar/gesture` | `{"gesture": "wave", "duration": 3, "mirror": false}` | Faz o gesto. |
| `neoalice/v1/<site>/cmd/avatar/pose` | `{"pose": "sitting", "duration": 20}` | Faz a pose e volta depois de `duration` (10 s sem ela). `straight` volta na hora. |
| `neoalice/v1/<site>/cmd/avatar/emoji` | `{"emoji": "😊"}` | Mostra o rosto do emoji por cerca de 3 s. |
| `neoalice/v1/<site>/cmd/avatar/animation` | `{"url": "https://...fbx", "duration": 5}` ou `{"name": "Wave"}` | Toca o arquivo FBX ou VRMA no corpo inteiro. |
| `neoalice/v1/<site>/evt/alice/night_mode` | `{"active": true}` | **Novo.** Modo noite. Ver a seção 3. |
| `neoalice/v1/companion/evt/companion/state` | estado do serviço `alice-companion` | Vínculo (sorriso leve) e energia (pálpebras). |
| `neoalice/v1/+/evt/vision/detection` | `{"detection": {"camera": "...", "objects": [...]}}` | Acena para quem chega. Com `bbox`, olha para a pessoa (seção 4). |

**Gestos aceitos:** `handup`, `index`, `ok`, `thumbup`, `thumbdown`, `side`, `wave`, `point`, `think`, `shrug`, `namaste`, `open`, `celebrate`. Com `"mirror": true`, um gesto de uma mão usa a outra mão.

**Poses aceitas:** `straight`, `side`, `hip`, `turn`, `back`, `wide`, `oneknee`, `kneel`, `bend`, `sitting`, `thinking`, `arms_open`, `bow`, `lying` e `lie_down`.

## 2. Os humores da NeoAlice no AIRI

Fonte: `packages/alice-motion/src/mood-vocabulary.ts`. O humor fica até o próximo humor.

| Humor da NeoAlice | Rosto e corpo no AIRI |
| --- | --- |
| `happy`, `playful`, `excited`, `cozy`, `mischief`, `love` | Sorriso leve e corpo animado. |
| `sad`, `melancholic` | Sobrancelhas tristes, boca para baixo, cabeça baixa. |
| `annoyed`, `angry`, `grouchy` | Sobrancelhas baixas, boca fechada. |
| `fear` | Olhos abertos e sobrancelhas altas (surpresa). |
| `reflective` | Rosto pensativo. |
| `calm`, `neutral` | Rosto neutro. |
| `tired`, `sleep` | **Corrigido.** Rosto sonolento: pálpebras pesadas, piscada lenta, respiração lenta, cabeça baixa. Ela continua em pé. Antes, esses dois humores viravam `neutral` e nada mudava. |
| `disgust` | Rosto neutro na VRM, porque o AIRI não tem uma expressão de nojo. |

**O humor sonolento não é o modo noite.** O humor `sleep` só deixa a avatar com cara de sono. Para ela deitar e dormir, a NeoAlice publica o modo noite (seção 3).

## 3. Modo noite (contrato novo)

### 3.1 O que a NeoAlice deve publicar

| Quando | Tópico | Payload | Retido |
| --- | --- | --- | --- |
| A Alice entra no modo noite: depois de "boa noite", ou no horário automático | `neoalice/v1/<site>/evt/alice/night_mode` | `{"active": true}` | Sim (`-r`) |
| A Alice sai do modo noite: "bom dia", wake word, ou o horário de acordar | `neoalice/v1/<site>/evt/alice/night_mode` | `{"active": false}` | Sim (`-r`) |

- **Por que retido:** um espelho que liga ou recarrega à noite recebe o estado na hora e já abre dormindo.
- **Formas aceitas:** o AIRI também lê `{"enabled": true}`, `{"night_mode": true}` e `{"state": "on"}` ou `{"state": "off"}`. Use `active` no código novo.
- **Mais de um espelho:** publique no site de cada espelho, ou no site de humor (`magicmirror`), que o AIRI também lê.

### 3.2 O que a avatar faz

- `active: true`: ela deita de lado (o FBX `lie-down.fbx` do Planejamento 10) e fecha os olhos em cerca de 1,5 s. Ela fica deitada até o modo terminar, sem limite de tempo.
- **Durante o modo noite:**
  - não pisca e não faz gestos de fala;
  - não acena para quem chega;
  - ignora os gestos da NeoAlice, e o console registra cada gesto ignorado.
- **Fala durante o modo noite:** ela abre os olhos enquanto fala e fecha de novo depois. Ela continua deitada.
- `active: false`: ela abre os olhos e levanta pelo caminho contrário da entrada.
- **Uma pose termina o modo noite no AIRI.** Por exemplo, `{"pose": "straight"}` levanta a avatar. O valor retido no broker não muda: depois de um recarregamento ela volta a dormir. Por isso, a NeoAlice deve sempre publicar `{"active": false}` para acordá-la.

### 3.3 O que alterar na NeoAlice

Estes são os pontos de publicação. Não há código Python aqui, porque o backend da NeoAlice não está nesta sessão.

1. **Na intenção de "boa noite"** (e no horário automático de dormir, se existir): publique `{"active": true}` retido em `evt/alice/night_mode`. Se ela responder com fala, publique a fala antes. Ela fala deitada de olhos abertos e fecha os olhos ao terminar.
2. **Na intenção de "bom dia"**, na wake word durante a noite, ou no horário de acordar: publique `{"active": false}` retido.
3. **O humor sonolento (opcional):** antes de dormir, `evt/mood` com `{"mood": "tired"}` deixa a avatar com cara de sono, em pé. É independente do modo noite.
4. **A posição da pessoa (seção 4):** quando a visão for ligada, inclua `bbox` normalizado em cada objeto `person`.

## 4. A avatar olha para a pessoa

### 4.1 Fontes da posição

| Fonte | Como ligar | Estado |
| --- | --- | --- |
| Webcam do navegador | `/mirror?look=person&source=webcam`, ou **Configurações > Modelos > VRM > Olhando para: Person (webcam)** | Pronta. Pede a permissão da câmera na primeira vez. |
| Visão da NeoAlice | `/mirror?look=person&source=vision` | Pronta no AIRI. Falta a NeoAlice publicar o `bbox` (seção 4.2). |
| Tamagotchi (desktop) | A mesma opção das configurações | **Bloqueada.** Ver a seção 4.3. |
| Android | A mesma opção das configurações | Usa a webcam do navegador do app. Precisa da permissão de câmera do Android. Não foi testada num aparelho. |

Outros valores de `look`: `camera` olha para o espectador, de frente. `mouse` segue o ponteiro do mouse. `none` deixa o olhar de repouso. O navegador guarda a escolha, então o próximo carregamento sem o parâmetro usa o mesmo valor.

**Como funciona:**

- A posição da pessoa vira um alvo à frente da tela.
- Os olhos vão até o alvo, e a cabeça vira até 20° para o lado e 10° para cima ou para baixo.
- Sem pessoa por 1,5 s (webcam) ou por 5 s (visão), ela volta ao olhar de repouso.
- **Webcam:** o detector de rosto é o MediaPipe que já existe no AIRI (`@proj-airi/model-driver-mediapipe`), a 10 detecções por segundo. O modelo de rosto baixa de `storage.googleapis.com` no primeiro uso. As imagens da câmera ficam no aparelho.

### 4.2 O que a visão da NeoAlice deve publicar

Hoje a ponte só conta as pessoas. Para a avatar olhar para a pessoa, cada objeto `person` precisa de `bbox` normalizado de 0 a 1:

```json
{ "detection": { "camera": "cam-espelho", "objects": [{ "class": "person", "confidence": 0.93, "bbox": { "x": 0.42, "y": 0.10, "w": 0.20, "h": 0.65 } }] } }
```

- `x` e `y`: o canto de cima à esquerda da caixa. `w` e `h`: a largura e a altura da caixa.
- A imagem é como a câmera vê, sem espelhar.
- **Com várias pessoas:** a avatar olha para a maior caixa, isto é, a pessoa mais perto.
- **Valores em pixels:** uma caixa em pixels ou fora de 0 a 1 é ignorada. A avatar ainda acena, mas não segue a pessoa.
- **Escolha da câmera:** use a câmera que fica no espelho. Uma câmera em outro lugar da sala dá uma direção errada.

### 4.3 Por que a webcam não funciona no Tamagotchi

A política de permissões do app desktop (`apps/stage-tamagotchi/src/main/services/electron/media-permissions.ts`) só aceita pedidos de mídia de áudio. Um pedido de vídeo (webcam) é negado. Por isso a função existe e não funciona no Tamagotchi.

Mudar essa política é uma decisão de segurança. Ela não foi alterada neste branch. Para liberar, é preciso aceitar pedidos de vídeo da página do próprio AIRI, do mesmo jeito que o áudio já é aceito. Isso precisa da aprovação do responsável.

## 5. Teste sem a NeoAlice

Atualize o servidor para o branch e recarregue o `/mirror`:

```bash
git fetch origin claude/plano-11-estados-olhar && git checkout claude/plano-11-estados-olhar && git pull --rebase origin claude/plano-11-estados-olhar
```

```bash
docker compose -f deploy/alice/compose.yaml up -d --build
```

Modo noite liga (retido):

```bash
mosquitto_pub -h 192.0.2.10 -r -t "neoalice/v1/magicmirror/evt/alice/night_mode" -m '{"active":true}'
```

Fala durante o modo noite:

```bash
mosquitto_pub -h 192.0.2.10 -t "neoalice/v1/magicmirror/cmd/tts/say" -m '{"text":"Boa noite. Durma bem.","lang":"pt-BR"}'
```

Modo noite desliga (retido):

```bash
mosquitto_pub -h 192.0.2.10 -r -t "neoalice/v1/magicmirror/evt/alice/night_mode" -m '{"active":false}'
```

Humor sonolento, em pé:

```bash
mosquitto_pub -h 192.0.2.10 -t "neoalice/v1/magicmirror/evt/mood" -m '{"mood":"tired","intensity":1}'
```

Pessoa vista pela visão, à esquerda da imagem (abra o `/mirror?look=person&source=vision` antes):

```bash
mosquitto_pub -h 192.0.2.10 -t "neoalice/v1/vision-espelho/evt/vision/detection" -m '{"detection":{"camera":"cam-espelho","objects":[{"class":"person","bbox":{"x":0.05,"y":0.1,"w":0.25,"h":0.7}}]}}'
```

No console da página `/mirror`, procure:

- `[neoalice-bridge] night mode on` e `[neoalice-bridge] night mode off`;
- `[webcam-person] following the person in front of the camera`, ou o motivo de a webcam não abrir.

Para apagar a mensagem retida do teste:

```bash
mosquitto_pub -h 192.0.2.10 -r -n -t "neoalice/v1/magicmirror/evt/alice/night_mode"
```

## 6. Evidências

As imagens usam a Eva convertida e as classes reais do app (`MoodFace`, `PerformanceDirector`, `useVRMEyeFocusFor`), simuladas a 60 quadros por segundo.

| Imagem | O que mostra |
| --- | --- |
| `evidencias/D11/eva-modo-noite.png` | Modo noite: deitada de lado, olhos fechados. |
| `evidencias/D11/eva-neutra.png` e `eva-sonolenta.png` | Humor neutro e humor sonolento: pálpebras pesadas, sem sorriso. |
| `evidencias/D11/eva-pessoa-esquerda-da-imagem.png` e `eva-pessoa-direita-da-imagem.png` | A pessoa num lado e no outro da imagem da câmera: os olhos e a cabeça viram para ela. |

## 7. Verificação deste branch

| Comando | Resultado |
| --- | --- |
| `pnpm -F @proj-airi/alice-motion exec vitest run` | 103 testes passam. Os novos cobrem o modo noite, o `bbox` e o humor sonolento. |
| `pnpm -F @proj-airi/alice-companion exec vitest run` | 52 testes passam. |
| `pnpm -F @proj-airi/stage-ui-three exec vitest run` | 135 testes passam. Os novos cobrem os olhos fechados, as pálpebras pesadas, o alvo da pessoa e a cabeça limitada a 20°. |
| `pnpm -F @proj-airi/stage-ui exec vitest run --project node` | 1410 testes, 1 falha. A falha (`chat.contract.test.ts`, cancelamento entre janelas) acontece também na `main` sem estas mudanças. |
| `vue-tsc --noEmit` em `stage-ui-three`, `stage-ui` e `stage-web`, e `tsc` em `alice-motion` | Sem erros. |
| ESLint nos arquivos alterados | Sem erros. |

Não testado: a webcam real num aparelho, e o Android. O container da sessão não tem câmera.
