# Planejamento 07 — Widgets, tela compartilhada e ferramentas com o cérebro da NeoAlice

> Data: 06/11/2026. Complementa o Planejamento 06 (o AIRI como rosto da NeoAlice).
> Pedido do responsável: a Alice deve poder compartilhar, ver a tela e usar widgets.

## 1. O que existe hoje no AIRI

Tudo abaixo é acionado por **chamadas de ferramenta do LLM do AIRI**. O LLM recebe a lista de ferramentas com a mensagem, e decide chamar uma delas.

| Recurso | Onde está | O que faz | Apps |
| --- | --- | --- | --- |
| `stage_widgets` | `apps/stage-tamagotchi/src/renderer/stores/tools/builtin/widgets.ts` | Abre, atualiza, remove e limpa janelas de widget sobre a área de trabalho. Componentes: `weather`, `map`, `artistry` (imagem), `extension-ui` (interface de um plugin). | Desktop |
| Clima (`get_weather`) | `.../builtin/weather.ts` | Busca o clima e a previsão de uma cidade. O LLM mostra o resultado com `stage_widgets` (`weather`). | Desktop |
| `image_journal` | `.../builtin/image-journal.ts` | Gera ou reaproveita imagens e mostra no chat, num widget, no fundo do palco, ou nos dois. | Desktop |
| `computer_use` | `.../builtin/computer-use.ts` | Controla programas: lê janelas, tira capturas de tela, usa teclado e mouse (AUV). Uma segunda ferramenta lê a captura. | Desktop |
| Visão (módulo Vision) | `packages/stage-ui/src/stores/modules/vision`, `use-vision-screen-capture.ts` | Captura a tela e manda a imagem a um modelo de visão. A conversa recebe a descrição. | Desktop (captura), Web (câmera ou tela do navegador) |
| MCP e plugins | `stores/mcp*.ts`, `services/airi/plugins` | Ferramentas de servidores MCP e de plugins, chamadas pelo LLM. | Desktop |

## 2. Por que nada disso funciona no modo cérebro

No modo cérebro (Planejamento 06), o texto e a voz vão para a NeoAlice, e o LLM do AIRI não roda. Então:

- nenhuma ferramenta é chamada, e nenhum widget abre;
- a NeoAlice não vê a tela do computador do avatar;
- a NeoAlice não tem tópico MQTT para pedir um widget ou uma ferramenta ao avatar.

## 3. Objetivo

1. **Widgets:** a Alice mostra clima, mapa, imagens e interfaces de plugin no desktop, quando a conversa pedir.
2. **Ver a tela:** com o consentimento do usuário, a Alice recebe o que está na tela (descrição do modelo de visão) e responde sobre ela.
3. **Compartilhar:** a Alice mostra ao usuário uma imagem, um link ou um resultado num widget, e o usuário pode mostrar a tela a ela.
4. **Usar ferramentas:** a Alice pede ao avatar ações locais (clima, imagem, captura), com limites de segurança.

## 4. Arquitetura proposta

### 4.1 Modo misto: o LLM do AIRI só para ferramentas (sem mudar a NeoAlice)

- A NeoAlice continua sendo a voz, a memória e a personalidade.
- Em paralelo, o LLM do AIRI (Ollama ou NIM, pelos repasses do Docker) recebe a mensagem do usuário e a resposta da NeoAlice, com a lista de ferramentas. Ele **não responde ao usuário**: só decide se chama `stage_widgets`, `get_weather` ou `image_journal`.
- Novo: um "turno só de ferramentas" no chat, que descarta o texto do LLM e mantém as chamadas de ferramenta.
- Custo: uma chamada a mais ao LLM por mensagem. Um modelo pequeno (phi4-mini) erra ferramentas, então o modo é opcional.

### 4.2 Pedidos da NeoAlice por MQTT (exige mudar a NeoAlice, só depois do avatar aprovado)

Tópicos novos no site do avatar, só leitura para o AIRI, no mesmo formato v1:

| Tópico | Payload | Efeito no avatar |
| --- | --- | --- |
| `cmd/avatar/widget` | `{"action":"spawn","widget":"weather","props":{...},"ttl_s":30}` | Abre, atualiza ou fecha um widget |
| `cmd/avatar/tool` | `{"tool":"get_weather","args":{...},"request_id":"..."}` | Executa uma ferramenta permitida |
| `evt/avatar/tool_result` | `{"request_id":"...","ok":true,"result":{...}}` | O avatar devolve o resultado à NeoAlice |

Regras:

- O AIRI executa só ferramentas de uma **lista de permitidas** (clima, widgets, imagem). `computer_use` nunca roda por MQTT sem confirmação na tela.
- O broker é anônimo (sem ACL). Qualquer aparelho da rede pode publicar. Por isso, a lista de permitidas e a confirmação local valem também para a NeoAlice.

### 4.3 Ver a tela

- O módulo Vision do AIRI captura a tela **só quando o usuário liga** "Compartilhar a tela com a Alice" (indicador visível enquanto ligado).
- A imagem vai ao modelo de visão local do usuário: Qwen3.5-2B no Axera (`/v1/chat/completions` compatível com OpenAI), por um repasse novo `/proxy/vision/` no Docker.
- A descrição vai à NeoAlice:
  - sem mudar a NeoAlice: como contexto de uma frase, por exemplo `evt/stt/final` com o texto "[tela: ...] pergunta do usuário";
  - depois de aprovado: num tópico próprio, `evt/vision/screen`.
- A imagem nunca sai da rede local. O AIRI guarda só a última descrição.

## 5. Fases

| Fase | Entrega | Muda a NeoAlice |
| --- | --- | --- |
| W1 | Repasse `/proxy/vision/` no Docker e padrão do provedor de visão (Qwen3.5-2B do Axera) | Não |
| W2 | "Compartilhar a tela com a Alice": captura sob demanda, descrição pelo modelo local, envio à NeoAlice como contexto da próxima frase | Não |
| W3 | Modo misto (4.1): turno só de ferramentas, com widgets, clima e imagens no modo cérebro | Não |
| W4 | Tópicos `cmd/avatar/widget`, `cmd/avatar/tool` e `evt/avatar/tool_result` no AIRI, com lista de permitidas | Não (o AIRI só passa a ouvir) |
| W5 | A NeoAlice publica os tópicos da W4 e recebe `evt/vision/screen` | Sim, só depois do avatar aprovado |

Ordem: W1 e W2 primeiro, porque ver a tela é o pedido mais direto e não depende de ferramentas. Depois W3. A W4 pode ser feita a qualquer momento, e a W5 depende da sua aprovação.

### Estado (06/11/2026)

A W3 foi feita antes da W1 e da W2, porque o responsável relatou que nenhum widget abre no modo cérebro.

- `packages/stage-ui/src/composables/use-neoalice-brain-tools.ts`: cada resposta da NeoAlice (as partes que chegam a menos de 2 s uma da outra) inicia um passe do modelo de chat do AIRI.
- O passe recebe só `stage_widgets`, `get_weather` e `image_journal`, a pergunta digitada (quando existe) e a resposta da NeoAlice. O texto do modelo é descartado.
- A opção "Abrir widgets para as respostas da NeoAlice" fica na página da ponte, abaixo do modo cérebro. Ela começa ligada.
- Só o app desktop registra essas ferramentas. Na Web, o passe não roda.
- Teste no Electron: um modelo falso pediu `stage_widgets` com o componente `weather`, e a janela do widget abriu.
- Uma pergunta por voz chega à NeoAlice como áudio, então o passe vê só a resposta dela.

### Estado da W4 (07/11/2026)

Feita. O AIRI ouve, no site do avatar e no site do espelho:

| Tópico | Payload | O que o AIRI faz |
| --- | --- | --- |
| `cmd/avatar/widget` | `{"action":"spawn","widget":"weather","props":{...},"ttl_s":30}`; `update` e `remove` com `id`; `clear` | Abre, atualiza ou fecha o widget pelo `stage_widgets` do desktop |
| `cmd/avatar/tool` | `{"tool":"get_weather","args":{...},"request_id":"..."}` | Roda a ferramenta se estiver na lista de permitidas e responde |
| `evt/avatar/tool_result` (publicado pelo AIRI, no site do avatar) | `{"request_id":"...","tool":"...","ok":true,"result":{...}}` ou `{"ok":false,"error":"..."}` | A resposta à NeoAlice |

- Lista de permitidas: `get_weather`, `stage_widgets` e `image_journal` (`libs/alice-motion/neoalice-tools.ts`). `computer_use` nunca roda por MQTT.
- Uma ferramenta fora da lista é recusada, registrada no console e respondida com `ok: false`.
- Na Web não há widgets: a resposta diz que a ferramenta precisa do app desktop.
- A NeoAlice continua sem mudança. Publicar esses tópicos é a W5.

## 6. Critérios de aceite

- W2: com a tela compartilhada, "o que tem na minha tela?" recebe uma resposta da NeoAlice que cita o conteúdo da tela. Com o compartilhamento desligado, nenhuma captura acontece.
- W3: no modo cérebro, "como está o tempo em São Paulo?" abre o widget de clima, e a NeoAlice responde em voz.
- W4: um `cmd/avatar/widget` publicado à mão abre o widget. Um `cmd/avatar/tool` com uma ferramenta fora da lista é recusado e registrado.

## 7. Segurança e privacidade

- Captura de tela só com consentimento explícito e indicador visível.
- `computer_use` (teclado e mouse) nunca é acionado pela NeoAlice sem confirmação na tela.
- Nenhuma imagem sai da rede local. Nenhum dado privado entra no repositório.
