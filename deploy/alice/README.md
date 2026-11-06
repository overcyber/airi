# Docker do AIRI para a Alice

Sobe o AIRI e o `alice-companion` em contêineres, para abrir o avatar em qualquer IP da máquina. É a parte D02 a D05 do `docs/alice-motion-engine/PLANEJAMENTO_05_DOCKER_AIRI_NEOALICE.md`.

Nada aqui muda a NeoAlice, o broker de produção ou o TalkingHead (porta 8081). O espelho continua no módulo antigo até você aprovar o novo avatar.

## O que sobe

| Serviço | Porta no host | Função |
| --- | --- | --- |
| `airi-web` | 4173 (HTTP) e 4443 (HTTPS), em todos os IPs | O AIRI, build offline, servido pelo Nginx |
| `alice-companion` | nenhuma | Estado do companion, num volume próprio |
| `mosquitto` (perfil `broker`) | 11883 e 19001, só em 127.0.0.1 | Broker de teste, para máquina sem o broker da NeoAlice |
| `mqtt-bridge` (perfil `bridge`) | nenhuma | Cópia só de leitura dos tópicos da NeoAlice, com o WebSocket que o navegador precisa |

O `airi-web` também repassa, no mesmo endereço da página:

| Caminho | Vai para | Variável |
| --- | --- | --- |
| `/mqtt` | WebSocket do broker | `AIRI_MQTT_WS_UPSTREAM` |
| `/proxy/llm/` | LLM compatível com OpenAI (Ollama, vLLM, NIM local) | `AIRI_LLM_UPSTREAM` |
| `/proxy/tts/` | TTS compatível com OpenAI (Kokoro) | `AIRI_TTS_UPSTREAM` |
| `/proxy/stt/` | Transcrição (Whisper) | `AIRI_STT_UPSTREAM` e `AIRI_STT_TRANSCRIBE_PATH` |
| `/proxy/nvidia/` | NVIDIA NIM na nuvem (`integrate.api.nvidia.com`) | `NVIDIA_API_KEY` (opcional) |
| `/proxy/neoalice/` | API da NeoAlice (rota `/audio` do microfone) | `NEOALICE_API_UPSTREAM` e `NEOALICE_API_KEY` |
| `/airi-defaults.json` | Primeiras configurações do AIRI | `AIRI_DEFAULT_*` |
| `/models/` | Os `.vrm` de `deploy/alice/modelos` | pasta montada |

Por que repassar: uma página HTTPS não pode chamar `http://` nem `ws://` (conteúdo misto), e muitos serviços recusam chamadas do navegador (CORS). No mesmo endereço, os dois problemas somem.

Sintoma típico de um serviço chamado direto, sem o repasse: "Failed to fetch" na validação do provedor. O texto do AIRI sobre `OLLAMA_ORIGINS` aparece junto, mas a causa é o endereço `http://`. Use sempre a URL `https://<ip>:4443/proxy/...`.

O repasse tira o cabeçalho `Origin` da chamada. Assim o Ollama aceita a chamada sem `OLLAMA_ORIGINS`.

## Configurações padrão do AIRI

O `airi-web` publica `/airi-defaults.json`, montado a partir do `.env`. Na primeira abertura, o AIRI usa esse arquivo para:

- configurar e validar os provedores Ollama (`/proxy/llm/v1/`), Kokoro (`/proxy/tts/v1/`), Whisper (`/proxy/stt/v1/`) e, com `NVIDIA_API_KEY`, o NVIDIA NIM (`/proxy/nvidia/v1/`);
- escolher o chat, a voz e a transcrição (`AIRI_DEFAULT_CHAT_*`, `AIRI_DEFAULT_TTS_*`, `AIRI_DEFAULT_STT_MODEL`);
- preencher a ponte NeoAlice: site, modo de fala, microfone e usuário (`AIRI_DEFAULT_NEOALICE_*`).

O AIRI só usa um padrão onde o navegador ainda não tem uma configuração própria. A exceção é uma URL salva que a página nunca alcança: `http://` de outra máquina numa página HTTPS, ou `integrate.api.nvidia.com` (CORS). Essa URL vira a do repasse. A chave da API salva fica. Tudo continua editável no app. Para voltar aos padrões num navegador, apague os dados do site (Configurações do navegador, Privacidade, Dados do site).

As chaves `NVIDIA_API_KEY` e `NEOALICE_API_KEY` ficam no contêiner. O repasse as acrescenta, e o navegador nunca as recebe.

## App desktop (Tamagotchi)

O app desktop não tem servidor próprio, então não lê este `.env`. Ele busca as configurações neste servidor:

1. Antes de compilar o desktop, crie `apps/stage-tamagotchi/.env.local` com `VITE_AIRI_SERVER_URL=http://<ip-do-docker>:4173`. Use a porta HTTP: o desktop não confia no certificado local do HTTPS.
2. Mantenha `AIRI_CORS_ORIGINS=null` neste `.env`. É o padrão. Sem isso, o servidor recusa as chamadas do desktop, que abre as páginas por `file://`.
3. Compile o desktop. Na primeira abertura, ele configura os provedores nos repasses deste servidor e a ponte NeoAlice em `ws://<ip-do-docker>:4173/mqtt`.

## Modo cérebro NeoAlice

Com "NeoAlice answers the chat" (`AIRI_DEFAULT_NEOALICE_BRAIN=true`), o AIRI é só o rosto da NeoAlice, como o TalkingHead. O texto digitado vai para a NeoAlice como `evt/stt/final` no site do avatar. A resposta dela aparece no chat e toca no avatar. O LLM do AIRI não responde, e nenhum provedor é necessário para o chat.

## Voz com a NeoAlice

- **A fala da NeoAlice no avatar:** a ponte lê `cmd/tts/audio` do site. Com o modo de fala "Play the audio that NeoAlice sends" (`AIRI_DEFAULT_NEOALICE_SPEECH_MODE=neoalice-audio`), o avatar toca o áudio com lip sync. O modo padrão é `silent`, para o espelho e o avatar não falarem juntos.
- **O microfone do avatar para a NeoAlice:** com "Send the microphone to NeoAlice" (`AIRI_DEFAULT_NEOALICE_VOICE_INPUT=true`), o AIRI corta o áudio em frases e publica cada uma como `evt/audio` (formato v1, WAV 16 kHz) no site do avatar, como um satélite. A NeoAlice responde com `cmd/tts/audio` no mesmo site, e o avatar toca com lip sync. O microfone fica mudo enquanto o avatar fala, e nenhuma frase nova sai enquanto uma espera resposta (até 150 s).
- Use um site só do avatar, por exemplo `airi-avatar`. A NeoAlice envia `cmd/tts/audio` para um site só. Com o site do espelho, os dois tocam a mesma resposta.
- `AIRI_DEFAULT_NEOALICE_USER_ID` é o UUID do usuário. Vazio, a NeoAlice usa o `NEOALICE_MQTT__DEFAULT_USER_ID` dela.
- **Palavra de ativação:** com `AIRI_DEFAULT_NEOALICE_WAKE_WORD=Eva`, o AIRI transcreve cada frase com o STT do `.env` (`AIRI_STT_UPSTREAM`) e só manda à NeoAlice a frase que começa com "Eva", como `evt/stt/final`. A palavra publica `evt/wake` e corta a fala do avatar. A NeoAlice responde ao `evt/wake` com `cmd/tts/stop`. "Eva" sozinha abre o microfone por 8 s para a próxima frase. Nesse modo, o microfone também escuta enquanto o avatar fala.
- "Announce the avatar as a satellite" (`AIRI_DEFAULT_NEOALICE_ANNOUNCE_STATE=true`) publica `evt/state` a cada 30 s. Assim a NeoAlice lista o avatar em `/satellites/active` e envia a ele os avisos gerais, por exemplo alarmes.
- O AIRI só publica no próprio site, e só `evt/audio` e `evt/state`. As duas opções começam desligadas.
- Desligue a "Audição" (Hearing) do AIRI quando usar o microfone para a NeoAlice. Senão, o AIRI também responde à mesma frase.
- A rota HTTP `POST /audio` não devolve áudio nesta versão da NeoAlice. Por isso, a voz usa o MQTT.

## Serviços em outra máquina

Cada variável `AIRI_*_UPSTREAM` aceita o IP de outra máquina. Exemplo com os serviços em `192.0.2.14` e o Ollama em `192.0.2.18`:

```env
AIRI_LLM_UPSTREAM=http://192.0.2.18:11434
AIRI_TTS_UPSTREAM=http://192.0.2.14:8880
AIRI_STT_UPSTREAM=http://192.0.2.14:9100
AIRI_STT_TRANSCRIBE_PATH=/inference
AIRI_MQTT_WS_UPSTREAM=mqtt-bridge:9001
NEOALICE_MQTT_HOST=192.0.2.14
NEOALICE_MQTT_PORT=1883
ALICE_COMPANION_MQTT_URL=mqtt://mqtt-bridge:1883
```

- `AIRI_STT_TRANSCRIBE_PATH=/inference`: um servidor Whisper sem a API da OpenAI recebe o áudio em `/inference`. O AIRI envia o campo `file` e lê o campo `text` da resposta, os mesmos desse servidor.
- Um broker com listener WebSocket (o Mosquitto da NeoAlice costuma ter um na porta 1884) não precisa da ponte: use `AIRI_MQTT_WS_UPSTREAM=192.0.2.14:1884`.
- O perfil `bridge` é só para um broker da NeoAlice sem listener WebSocket. Ele exige `NEOALICE_MQTT_HOST` no `.env`. Com a porta 1884, suba sem `--profile bridge`. Ele só lê os tópicos `neoalice/#`. Nada que o AIRI ou o companion publicam chega ao broker da NeoAlice.

Depois de mudar o `.env`, com o WebSocket do broker (porta 1884):

```bash
docker compose -f deploy/alice/compose.yaml up -d --build
```

Sem WebSocket no broker, com `NEOALICE_MQTT_HOST` e `AIRI_MQTT_WS_UPSTREAM=mqtt-bridge:9001`:

```bash
docker compose -f deploy/alice/compose.yaml --profile bridge up -d --build
```

Teste os repasses no terminal, na máquina do Docker:

```bash
curl -k https://127.0.0.1:4443/proxy/llm/v1/models
```

```bash
curl -k https://127.0.0.1:4443/proxy/tts/v1/models
```

```bash
curl -k -F file=@teste.wav -F language=pt https://127.0.0.1:4443/proxy/stt/v1/audio/transcriptions
```

## Por que HTTPS

O navegador só libera algumas funções em contexto seguro: HTTPS, ou `http://localhost`. O AIRI usa essas funções (Web Locks, IDs aleatórios, armazenamento dos modelos, microfone). Sem elas, o app não inicia.

- Na própria máquina, por exemplo no MagicMirror: `http://localhost:4173`.
- Em qualquer outro aparelho: `https://<ip-da-maquina>:4443`.

## Requisitos

- Docker com Compose v2 (`docker compose version`).
- `openssl` no host, para os certificados.
- Internet no primeiro build: o build baixa as imagens base, o pnpm, as dependências e o SDK do Live2D. Depois, o app roda sem internet.
- Memória: o build do app usa até 8 GB.

## Passo a passo

Rode na raiz do repositório.

1. Tenha o arquivo `eva2.glb`: o repositório `talkinghead-neoalice` ao lado do `airi` (por exemplo `~/talkinghead-neoalice` e `~/airi`), ou o caminho do arquivo em `EVA_GLB`. Nenhum servidor é necessário.
2. Rode o script. Ele cria o `.env` com os IPs da máquina (`hostname -I`), os certificados, e a Eva em VRM: se `modelos/` não tem nenhum `.vrm`, ele pega o `avatars/eva2.glb` e converte sozinho em `modelos/eva2.vrm`. Na primeira vez, isso constrói a imagem de ferramentas e leva alguns minutos. Com o GLB em outro lugar: `EVA_GLB=/caminho/eva2.glb deploy/alice/scripts/preparar.sh`.

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

Com os padrões do servidor (seção "Configurações padrão do AIRI"), os provedores abaixo já vêm configurados. Estes passos servem para conferir ou mudar.

- **Modelo:** em Configurações, Modelos, "Select model", a `eva2` aparece na lista, vinda do servidor. Escolha e confirme.
- **Ponte NeoAlice:** o endereço padrão do broker já é `/mqtt` da página. Só ligue a ponte e informe o site.
- **LLM local:** provedor "Ollama" ou "OpenAI compatible" com URL `https://<ip>:4443/proxy/llm/v1/`.
- **Kokoro:** em Provedores, Voz, "OpenAI Compatible". URL `https://<ip>:4443/proxy/tts/v1/`. Modelo `kokoro`. Voz, por exemplo, `pf_dora`.
- **Whisper:** em Provedores, Transcrição, "OpenAI Compatible". URL `https://<ip>:4443/proxy/stt/v1/`. Modelo `whisper-1` (o servidor ignora o nome).
- **Chave da API nos provedores "OpenAI Compatible" de voz e transcrição:** o AIRI exige uma. Para o Kokoro e o Whisper, que não pedem chave, escreva qualquer texto, por exemplo `local`. Sem chave, a validação falha, e o provedor não aparece no seletor de voz ou de transcrição.
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
| `/proxy/llm/` responde 502 | O contêiner não alcança o LLM. Veja a causa com `docker compose -f deploy/alice/compose.yaml logs airi-web`: "Connection refused" quer dizer que o Ollama escuta só em 127.0.0.1. Use `OLLAMA_HOST=0.0.0.0` e reinicie o Ollama. "timed out" quer dizer firewall. |
| O avatar não fala o que a NeoAlice diz | O modo de fala da ponte está em "Silent". Escolha "Play the audio that NeoAlice sends". |
| O microfone mostra "NeoAlice answered 401" | Falta `NEOALICE_API_KEY` no `.env`, ou a chave está errada. |
| "Failed to fetch" ao validar um provedor | A URL do provedor é `http://` ou de outro endereço. Use `https://<ip>:4443/proxy/...`. |
| O provedor de voz ou transcrição não aparece no seletor | O provedor não passou na validação. Preencha a chave da API com qualquer texto e confira a URL. |
| NVIDIA NIM com "Failed to fetch" | Em "Advanced", a URL precisa ser `https://<ip>:4443/proxy/nvidia/v1/`. Uma URL salva antes, de `integrate.api.nvidia.com`, continua salva: troque à mão. |
| Um modelo não carrega, e o console mostra 403 em `/models/...` | O arquivo não tem permissão de leitura para o Nginx. Rode `chmod a+r deploy/alice/modelos/*.vrm`, ou `preparar.sh` de novo. |
| A `eva2` não aparece | O arquivo precisa terminar em `.vrm` e estar em `deploy/alice/modelos`. Recarregue a página. |
| O companion reinicia sem parar | Veja `docker compose -f deploy/alice/compose.yaml logs alice-companion`. O broker precisa estar acessível em `ALICE_COMPANION_MQTT_URL`. |

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `compose.yaml` | Serviços, portas e volumes |
| `.env.example` | Modelo do `.env` |
| `docker/Dockerfile` | Imagens `web`, `companion` e `tools` (conversor da Eva) |
| `docker/nginx/templates/default.conf.template` | Nginx: SPA, HTTPS, proxies e modelos |
| `docker/nginx/40-airi-setup.sh` | Ajustes do Nginx na partida |
| `docker/companion-entrypoint.sh` | Partida do companion |
| `scripts/preparar.sh` | `.env` e certificados no host |
| `mqtt-test/mosquitto.conf` | Broker de teste |
| `mqtt-bridge/start.sh` | Ponte só de leitura para o broker da NeoAlice |
| `modelos/` | Seus `.vrm`, fora do Git |
| `tls/` | Certificados, fora do Git |
