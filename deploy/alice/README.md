# Docker do AIRI para a Alice

Sobe o AIRI e o `alice-companion` em contêineres, para abrir o avatar em qualquer IP da máquina. É a parte D02 a D05 do `docs/alice-motion-engine/PLANEJAMENTO_05_DOCKER_AIRI_NEOALICE.md`.

Nada aqui muda a NeoAlice, o broker de produção ou o TalkingHead (porta 8081). O espelho continua no módulo antigo até você aprovar o novo avatar.

## O que sobe

| Serviço | Porta no host | Função |
| --- | --- | --- |
| `airi-web` | 4173 (HTTP) e 4443 (HTTPS), em todos os IPs | O AIRI, build offline, servido pelo Nginx |
| `alice-companion` | nenhuma | Estado do companion, num volume próprio |
| `mosquitto` (perfil `broker`) | 11883 e 19001, só em 127.0.0.1 | Broker de teste, para máquina sem o broker da NeoAlice |

O `airi-web` também repassa, no mesmo endereço da página:

| Caminho | Vai para | Variável |
| --- | --- | --- |
| `/mqtt` | WebSocket do broker | `AIRI_MQTT_WS_UPSTREAM` |
| `/proxy/llm/` | LLM compatível com OpenAI (Ollama, vLLM, NIM local) | `AIRI_LLM_UPSTREAM` |
| `/proxy/tts/` | TTS compatível com OpenAI (Kokoro) | `AIRI_TTS_UPSTREAM` |
| `/proxy/nvidia/` | NVIDIA NIM na nuvem (`integrate.api.nvidia.com`) | fixo |
| `/models/` | Os `.vrm` de `deploy/alice/modelos` | pasta montada |

Por que repassar: uma página HTTPS não pode chamar `http://` nem `ws://` (conteúdo misto), e muitos serviços recusam chamadas do navegador (CORS). No mesmo endereço, os dois problemas somem.

## Por que HTTPS

O navegador só libera algumas funções em contexto seguro: HTTPS, ou `http://localhost`. O AIRI usa essas funções (Web Locks, IDs aleatórios, armazenamento dos modelos, microfone). Sem elas, o app não inicia.

- Na própria máquina, por exemplo no MagicMirror: `http://localhost:4173`.
- Em qualquer outro aparelho: `https://<ip-da-maquina>:4443`.

## Requisitos

- Docker com Compose v2 (`docker compose version`).
- `openssl` no host, para os certificados.
- Internet no primeiro build: o build baixa as dependências e o SDK do Live2D. Depois, o app roda sem internet.
- Memória: o build do app usa até 8 GB.

## Passo a passo

Rode na raiz do repositório.

1. Coloque a Eva em VRM em `deploy/alice/modelos/eva2.vrm` (veja `modelos/README.md`).
2. Prepare o `.env` e os certificados. O script lê os IPs da máquina com `hostname -I`.

   ```bash
   deploy/alice/scripts/preparar.sh
   ```

3. Confira `deploy/alice/.env`, principalmente o broker, o LLM e o TTS.
4. Construa e suba:

   ```bash
   docker compose -f deploy/alice/compose.yaml up -d --build
   ```

   Numa máquina sem o broker da NeoAlice, use o broker de teste:

   ```bash
   docker compose -f deploy/alice/compose.yaml --profile broker up -d --build
   ```

   Com o broker de teste, ponha no `.env`: `AIRI_MQTT_WS_UPSTREAM=mosquitto:9001` e `ALICE_COMPANION_MQTT_URL=mqtt://mosquitto:1883`.

5. Confira:

   ```bash
   docker compose -f deploy/alice/compose.yaml ps
   ```

   ```bash
   curl -fsS http://127.0.0.1:4173/healthz
   ```

6. Em cada aparelho que vai abrir o HTTPS, instale a autoridade local uma vez. Baixe em `http://<ip>:4173/airi-local-ca.crt` e instale como autoridade confiável. Sem isso, o navegador mostra um aviso; "Avançado" e "Continuar" também funcionam.

## Configurar no AIRI

- **Modelo:** em Configurações, Modelos, "Select model", a `eva2` aparece na lista, vinda do servidor. Escolha e confirme.
- **Ponte NeoAlice:** o endereço padrão do broker já é `/mqtt` da página. Só ligue a ponte e informe o site.
- **LLM local:** provedor "OpenAI compatible" com URL `https://<ip>:4443/proxy/llm/v1/`.
- **Kokoro:** provedor de voz compatível com OpenAI com URL `https://<ip>:4443/proxy/tts/v1/`.
- **NVIDIA NIM:** o provedor "NVIDIA NIM" aparece na versão Web quando ela roda neste servidor. A URL padrão já é `/proxy/nvidia/v1/`. Informe só a chave da API. Um NIM local entra por `/proxy/llm/`.

## Atualizar

```bash
git pull
docker compose -f deploy/alice/compose.yaml up -d --build
```

O estado do companion fica no volume `alice-companion-data`. Não rode `docker compose down -v` em produção: o `-v` apaga esse volume.

## Voltar atrás

```bash
docker compose -f deploy/alice/compose.yaml down
```

O TalkingHead e a configuração do espelho não mudam com este Docker, então não há mais nada a restaurar.

## Problemas comuns

| Sintoma | Causa e solução |
| --- | --- |
| A página abre em branco ou com erro de `request` pelo IP | Abriu `http://<ip>:4173`. Use `https://<ip>:4443` ou `http://localhost:4173`. |
| Aviso de certificado | A autoridade local não está instalada no aparelho (passo 6), ou o IP não está no certificado. Acrescente em `AIRI_TLS_NAMES`, rode `preparar.sh` de novo e depois `docker compose -f deploy/alice/compose.yaml restart airi-web`. |
| `/mqtt` não conecta | `AIRI_MQTT_WS_UPSTREAM` precisa apontar para o listener `websockets` do Mosquitto, como o contêiner o vê. |
| `/proxy/llm/` responde 502 | O LLM não está no ar ou não escuta no IP do Docker. No Ollama, use `OLLAMA_HOST=0.0.0.0`. |
| A `eva2` não aparece | O arquivo precisa terminar em `.vrm` e estar em `deploy/alice/modelos`. Recarregue a página. |
| O companion reinicia sem parar | Veja `docker compose -f deploy/alice/compose.yaml logs alice-companion`. O broker precisa estar acessível em `ALICE_COMPANION_MQTT_URL`. |

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `compose.yaml` | Serviços, portas e volumes |
| `.env.example` | Modelo do `.env` |
| `docker/Dockerfile` | Imagens `web` e `companion` |
| `docker/nginx/templates/default.conf.template` | Nginx: SPA, HTTPS, proxies e modelos |
| `docker/nginx/40-airi-setup.sh` | Ajustes do Nginx na partida |
| `docker/companion-entrypoint.sh` | Partida do companion |
| `scripts/preparar.sh` | `.env` e certificados no host |
| `mqtt-test/mosquitto.conf` | Broker de teste |
| `modelos/` | Seus `.vrm`, fora do Git |
| `tls/` | Certificados, fora do Git |
