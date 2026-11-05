# Testes da V1, da V2 e da ponte NeoAlice (S08) dentro do app

Este kit testa o `stage-web` real com a Neptuna. Ele não precisa de LLM nem de TTS de verdade: um servidor falso responde como um servidor compatível com OpenAI.

## O que o teste faz

1. Configura um provedor de LLM e um de voz apontados para o servidor falso.
2. Importa a Neptuna (`packages/alice-motion/fixtures/vrm/neptuna/neptuna.vrm`) e a escolhe.
3. Na seção **Motions** da configuração VRM, importa um VRMA com o nome `Happy Spin` e a descrição `Spin around with joy`, e toca o movimento.
4. No palco, manda três mensagens:
   - `oi, tudo bem?`: o servidor espera 4 s (ela pensa, com a mão no queixo) e responde com `{"emotion":"happy","motion":"greeting"}`.
   - `fiquei triste hoje`: responde com `{"emotion":"sad"}`.
   - `mostra um pulo`: responde com `{"emotion":"happy","motion":"happy_spin"}`, o VRMA importado.
5. Confere as verificações e grava `resultado-checks.json`.

| Verificação | Prova |
| --- | --- |
| A Neptuna aparece no palco | Captura `03-stage-idle.png` |
| O VRMA importado aparece na configuração | A lista de movimentos importados aparece |
| O prompt lista os emotes do Utsuwa | O servidor recebeu `- greeting (Greet with a polite bowing motion)` |
| O prompt lista o VRMA importado com a descrição | O servidor recebeu `- happy_spin (Spin around with joy)` |
| O ACT `greeting` tocou | Console: `VRM motion played greeting` |
| O ACT `happy_spin` tocou | Console: `VRM motion played happy_spin` |
| Nenhum movimento desconhecido | Sem o aviso `is not in the motion library` |
| A fala chamou o TTS | O servidor recebeu `/audio/speech` |
| Sem erro de página | Sem `PAGEERROR` |

## Diagnóstico de inicialização (Vite vs. aplicativo vs. teste)

O comando `pnpm -F @proj-airi/stage-web exec vite --port 5173 --host 0.0.0.0` **não termina sozinho**: quando mostra `VITE ready`, o servidor está escutando. Isso não confirma que o AIRI renderizou no navegador nem inicia o servidor falso de IA e o Playwright. As mensagens UnoCSS `unmatched utility` são avisos de estilo, não erros fatais do processo.

Há três níveis independentes:
1. **HTTP**: `curl -I http://127.0.0.1:5173/` precisa responder.
2. **Aplicativo**: abrir a página no Chromium e verificar se o `#app` renderizou, sem `PAGEERROR`.
3. **Fluxo de teste**: LLM/TTS simulados na porta 8091 + Playwright com Neptuna e VRMA.

### Método recomendado: um comando, sem tocar na NeoAlice

Execute **na raiz do repositório** (no seu caso, `/mnt/dockers/airi`), depois de instalar as dependências:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium

# Apenas verifica se o AIRI realmente renderiza no Chromium.
node docs/alice-motion-engine/teste-app/run-local.cjs smoke ./saida-smoke

# Executa o servidor falso e os testes V1/V2 completos.
node docs/alice-motion-engine/teste-app/run-local.cjs v1v2 ./saida-v1v2
```

`run-local.cjs` usa `127.0.0.1:5173` e **reutiliza o Vite se já estiver rodando**, sem encerrá-lo. Se a porta estiver livre, sobe o Vite, espera o HTML ficar pronto e o desliga no encerramento. No modo `v1v2`, inicia também o servidor falso OpenAI/TTS em `127.0.0.1:8091`, usando um arquivo novo de requisições por teste. Não publica MQTT e não modifica NeoAlice.

Artefatos (de acordo com o diretório passado):
- `smoke.png`, `smoke-result.json` para carregamento da SPA.
- `playwright.log`, `steps.txt`, `console.txt`, `resultado-checks.json`, `failed.png` (quando houver erro) e capturas para o fluxo V1/V2.
- `vite.log` e `fake.log` somente quando os respectivos processos foram iniciados pelo executor.

Se a falha ocorrer em um seletor de interface, o erro fica registrado em `steps.txt`, e o navegador produz `failed.png`. **Não é possível afirmar que os nove checks passam nesta máquina sem executar o comando nela**. Falhas de WebGL, SDK e dependências nativas aparecem no diagnóstico do Chromium.

### Comandos mínimos para investigar um resultado negativo

```bash
curl -sS -I http://127.0.0.1:5173/
ss -lntp | grep -E ':5173|:8091'
cat ./saida-smoke/smoke-result.json
cat ./saida-v1v2/resultado-checks.json
tail -n 60 ./saida-v1v2/playwright.log
tail -n 60 ./saida-v1v2/steps.txt
```

Se o Playwright não tiver bibliotecas nativas do sistema, siga a mensagem da instalação do Chromium e, quando necessário e autorizado na máquina, use `pnpm exec playwright install-deps chromium`.

**Atenção a rede:** ao abrir o Vite por `http://192.168.10.18:5173/` em **outro equipamento**, `127.0.0.1:8091` aponta para esse outro equipamento, e não ao host AIRI. O executor recomendado roda o Chromium no mesmo host do teste, evitando essa ambiguidade. Para execuções distribuídas, use `FAKE_OPENAI_BASE_URL` e configure deliberadamente o bind do mock (que, por padrão, aceita somente loopback). O servidor falso não deve ficar aberto à internet nem substitui um LLM/TTS real.

---

## Como rodar

Requisitos: o repositório instalado (`pnpm install`) e o Playwright com o Chromium (`pnpm exec playwright install chromium`, se a máquina ainda não tiver).

1. Inicie o `stage-web`:

   ```bash
   pnpm -F @proj-airi/stage-web exec vite --port 5173 --host 127.0.0.1
   ```

2. Em outro terminal, inicie o servidor falso:

   ```bash
   node docs/alice-motion-engine/teste-app/fake-openai-server.cjs
   ```

3. Em outro terminal, rode o teste. O primeiro carregamento do Vite pode levar alguns minutos.

   ```bash
   node docs/alice-motion-engine/teste-app/teste-app-v1-v2.cjs ./saida-teste-app
   ```

O comando termina com código 0 quando todas as verificações passam. As capturas, o `console.txt`, o `steps.txt` e o `resultado-checks.json` ficam em `./saida-teste-app`.

Para gravar um vídeo da conversa, defina `VIDEO=1`. A captura de tela é lenta com renderização por software, então o vídeo mostra melhor o tempo de cada fase.

Variáveis opcionais:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `BASE_URL` | `http://127.0.0.1:5173` | Endereço do `stage-web` |
| `AIRI_DIR` | A raiz deste repositório | Onde estão a Neptuna e as animações |
| `VRM_FILE` | A Neptuna | Outro VRM para testar, por exemplo a Eva convertida (V4) |
| `VRMA_FILE` | Uma cópia de `emote-spin.vrma` | Outro VRMA para importar |
| `FAKE_LOG` | `airi-fake-openai-requests.jsonl` na pasta temporária | Registro das requisições do servidor falso |
| `FAKE_OPENAI_BASE_URL` | `http://127.0.0.1:8091/v1/` | API do mock alcançável pelo Chromium que executa o teste |
| `FAKE_OPENAI_PORT` | `8091` | Porta alternativa para o processo do fake server e para `run-local.cjs` |
| `AIRI_TEST_PORT` | `5173` | Porta do Vite para `run-local.cjs` |

## Limites

- O servidor falso só testa o caminho do app. Ele não testa a qualidade do LLM ao escolher um emote.
- O áudio do TTS falso é um tom. Ele aciona a fala e o lip-sync, mas não é voz.
- Num ambiente sem `cubism.live2d.com`, o teste em nuvem usou o `live2dcubismcore.min.js` do pacote npm `live2dcubismcore` só para o app iniciar. Na sua máquina, use o arquivo oficial (README, "Rodar 100% local").

## Teste da ponte NeoAlice (S08)

`teste-ponte-s08.cjs` testa a ponte com um broker MQTT de verdade. Ele publica como a NeoAlice, num site de teste (`airi-test`), então uma NeoAlice e um espelho reais no mesmo broker ignoram essas mensagens.

| Passo | Mensagem publicada | O que o teste confere |
| --- | --- | --- |
| 1 | `evt/mood` `playful` | Humor feliz |
| 2 | `evt/stt/final` | Pose de "pensando" |
| 3 | `cmd/tts/say` | O AIRI falou o texto com a voz configurada (o servidor falso recebeu `/audio/speech` com o texto) |
| 4 | `cmd/avatar/gesture` `index` | O console mostra `played gesture_index as clip shoot` |
| 5 | `evt/mood` `melancholic` e `cmd/tts/audio` | Rosto e corpo tristes, áudio da NeoAlice tocando |
| 6 | `cmd/tts/stop` | A fala para |
| 7 | `cmd/tts/say` em outro site | Nunca é falado |
| 8 | `cmd/avatar/gesture` `moonwalk` | Ignorado com o motivo `the catalog has no action for this command` |

Requisitos a mais: um broker com listener WebSocket e TCP. Por exemplo, um Mosquitto só para o teste. Numa máquina que já tem um broker de produção na porta 1883, use outras portas e passe `BRIDGE_WS_URL` e `PUBLISH_URL`:

```text
listener 1883 127.0.0.1
protocol mqtt
listener 9001 127.0.0.1
protocol websockets
allow_anonymous true
```

Com o `stage-web` e o servidor falso rodando:

```bash
VIDEO=1 node docs/alice-motion-engine/teste-app/teste-ponte-s08.cjs ./saida-teste-ponte
```

Variáveis: `BRIDGE_WS_URL` (padrão `ws://127.0.0.1:9001`), `PUBLISH_URL` (padrão `mqtt://127.0.0.1:1883`) e `BRIDGE_SITE` (padrão `airi-test`).

Para provar que a ponte nunca publica, ligue `log_type all` no Mosquitto. O log não pode ter nenhuma linha `Received PUBLISH from airi-neoalice-bridge-`.

