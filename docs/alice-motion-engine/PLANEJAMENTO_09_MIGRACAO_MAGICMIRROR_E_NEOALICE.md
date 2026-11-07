# Planejamento 09 — Migração do MagicMirror local e mudanças na NeoAlice

> Data: 07/11/2026. Continua os Planejamentos 06 (F6, troca do espelho), 07 (W5) e 08 (componentes 1 a 3).
> Os endereços são de exemplo (`192.0.2.x`), porque este repositório é público. Troque pelos endereços da sua rede.

## 1. Ordem obrigatória

1. **Parte A:** migrar o MagicMirror local para o AIRI, sem mudar a NeoAlice.
2. **Parte B:** mudar a NeoAlice, uma mudança por vez. Só comece depois da Parte A, e só com a regra de bloqueio cumprida (`JUSTIFICATIVA_ALTERACOES_NEOALICE.md`, seção 5).

Em cada passo, faça o teste do passo antes do próximo. Se um teste falhar, faça a volta do passo.

## 2. O que o AIRI já faz sem mudar a NeoAlice (07/11/2026)

| Recurso | Como funciona |
| --- | --- |
| Fala do espelho | O AIRI toca o `cmd/tts/audio` do site `magicmirror` e do site `airi-avatar`. A mesma fala nos dois sites, dentro de 30 s, toca uma vez só. |
| Lip sync em português | O AIRI lê o campo `text` do `cmd/tts/audio`, converte o texto em formas de boca com regras do português do Brasil e segue o áudio. A boca fecha em p, b e m, e o "ti" soa "tchi". Configuração: "Lip sync" na página do VRM, padrão "Brazilian Portuguese text". |
| Abertura da boca | Configuração "Mouth opening" (padrão 0,6), ou `/mirror?mouth=0.7` no espelho |
| Sorriso e fala | Enquanto ela fala, o humor sai da boca. Olhos e sobrancelhas continuam com o humor. |
| Humor, emoji, gestos, poses, animações | Os comandos atuais da NeoAlice (`evt/mood`, `cmd/avatar/*`) |
| Movimentos embutidos | Escolhidos pelo texto da fala ("Olá" acena, "Obrigada" faz reverência, "Sim" acena com a cabeça) e por emojis: aceno (U+1F44B), mãos juntas (U+1F64F), paz (U+270C), festa (U+1F973, U+1F389), pensar (U+1F914), apontar (U+1F449), dança (U+1F483), óculos escuros (U+1F60E), abraço (U+1F917) e olhos (U+1F440). A NeoAlice também pode pedir um pelo nome (seção 6, B7). |
| Botões Play no desktop | O botão Play das configurações toca o movimento no avatar da janela principal |
| Widgets e ferramentas | `cmd/avatar/widget` e `cmd/avatar/tool`, com lista de permitidas (Planejamento 07, W4) |
| Poses de presença | O AIRI não decide sentar nem levantar. Ele só executa o `cmd/avatar/pose` da NeoAlice (Planejamento 08, seção 8). |

## 3. Máquinas e portas

| Papel | Exemplo | Portas |
| --- | --- | --- |
| Servidor (Docker do AIRI, broker, NeoAlice, TalkingHead) | `192.0.2.10` | 4443 (AIRI HTTPS), 4173 (AIRI HTTP local), 1883 (MQTT), 1884 (MQTT WebSocket), 8081 (TalkingHead) |
| Espelho (MagicMirror) | `192.0.2.20` | 8080 (MagicMirror) |

O espelho e o servidor podem ser a mesma máquina. Nesse caso, use `localhost` no lugar dos IPs.

## 4. Parte A — Migração do MagicMirror local

### A1. Backup (no espelho)

1. Copie a configuração de produção:

   ```bash
   cp ~/MagicMirror/config/config.js ~/MagicMirror/config/config.js.antes-airi
   ```

2. Rode o backup do repositório `MMM-avatar-3d`:

   ```bash
   ~/MMM-avatar-3d/scripts/backup-producao.sh S16
   ```

3. Grave 2 minutos do tráfego atual, para comparar depois:

   ```bash
   timeout 120 mosquitto_sub -h 192.0.2.10 -v -t 'neoalice/v1/#' > ~/mqtt-antes-airi.log
   ```

Teste: o arquivo `config.js.antes-airi` existe, e o log tem linhas de `neoalice/v1/`.

### A2. Subir o AIRI no Docker (no servidor)

1. Atualize o repositório e prepare:

   ```bash
   cd ~/airi && git pull
   ```

   ```bash
   deploy/alice/scripts/preparar.sh
   ```

   O script cria o `.env`, os certificados, a Eva ruiva em VRM (`modelos/eva-ruiva.vrm`) e copia as animações do TalkingHead para `deploy/alice/animacoes/`.

2. Confira estas linhas em `deploy/alice/.env`:

   | Variável | Valor para o espelho | Para que serve |
   | --- | --- | --- |
   | `AIRI_TLS_NAMES` | `192.0.2.10` e os nomes da máquina | IPs aceitos no certificado |
   | `AIRI_MQTT_WS_UPSTREAM` | `host.docker.internal:1884` (o listener WebSocket do broker) | `/mqtt` da página |
   | `AIRI_TALKINGHEAD_UPSTREAM` | `http://192.0.2.10:8081` | FBX de terceiros que não estão no repositório (Mixamo, Ready Player Me) |
   | `AIRI_DEFAULT_NEOALICE_ENABLED` | `true` | Liga a ponte sem abrir as configurações |
   | `AIRI_DEFAULT_NEOALICE_SITE` | `airi-avatar` | Site próprio do avatar |
   | `AIRI_DEFAULT_NEOALICE_MOOD_SITE` | `magicmirror` | Humor e gestos do espelho |
   | `AIRI_DEFAULT_NEOALICE_MIRROR_SPEECH` | `true` | Toca a fala que vai para o espelho |
   | `AIRI_DEFAULT_NEOALICE_SPEECH_MODE` | `neoalice-audio` | Toca o áudio da NeoAlice |
   | `AIRI_DEFAULT_NEOALICE_VOICE_INPUT` | `false` no começo | Microfone do espelho para a NeoAlice. O espelho já tem o satélite ReSpeaker. |

3. Suba e confira:

   ```bash
   docker compose -f deploy/alice/compose.yaml up -d --build
   ```

   ```bash
   curl -fsS http://127.0.0.1:4173/healthz
   ```

Teste: `https://192.0.2.10:4443/mirror` abre num navegador do servidor e mostra a Eva.

Volta: `docker compose -f deploy/alice/compose.yaml down`. Nada no espelho mudou ainda.

### A3. Confiar no certificado (no espelho)

O MagicMirror usa o Electron, que confia nas autoridades do sistema.

1. Baixe a autoridade local:

   ```bash
   curl -o /tmp/airi-local-ca.crt http://192.0.2.10:4173/airi-local-ca.crt
   ```

2. Instale no sistema (Debian e Raspberry Pi OS):

   ```bash
   sudo cp /tmp/airi-local-ca.crt /usr/local/share/ca-certificates/airi-local-ca.crt
   ```

   ```bash
   sudo update-ca-certificates
   ```

3. O Chromium e o Electron também leem o banco NSS do usuário. Se o aviso de certificado continuar, instale nele:

   ```bash
   certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n airi-local-ca -i /tmp/airi-local-ca.crt
   ```

Teste: `curl https://192.0.2.10:4443/healthz` no espelho responde sem `-k`.

Alternativa sem HTTPS: com o espelho e o servidor na mesma máquina, use `http://localhost:4173/mirror`. O microfone funciona em `localhost` sem certificado.

### A4. Instalar o módulo MMM-AiriStage (no espelho)

1. Copie o módulo:

   ```bash
   cp -r ~/MMM-avatar-3d/MMM-AiriStage ~/MagicMirror/modules/
   ```

2. Crie um perfil de teste. Copie a produção:

   ```bash
   cp ~/MagicMirror/config/config.js ~/MagicMirror/config/config.airi-teste.js
   ```

3. Em `config.airi-teste.js`, troque o bloco do `MMM-AvatarMQTT` por este:

   ```text
   {
       module: "MMM-AiriStage",
       position: "fullscreen_below",
       config: {
           url: "https://192.0.2.10:4443/mirror?mouth=0.6",
           allow: "autoplay; microphone"
       }
   }
   ```

   Parâmetros da URL:

   | Parâmetro | Efeito |
   | --- | --- |
   | `mouth=0.6` | Abertura da boca, de 0,2 a 1 |
   | `view=bust` | Só cabeça e peito. Sem ele, o corpo inteiro aparece, e ela pode sentar no chão. |
   | `stats=1` | Mostra fps e custo por quadro, para o teste de desempenho |

4. O MagicMirror bloqueia o áudio até o primeiro clique. No `config.airi-teste.js`, acrescente a opção do Electron que libera o áudio:

   ```text
   electronSwitches: ["autoplay-policy=no-user-gesture-required"],
   ```

### A5. Configurar o AIRI no navegador do espelho (uma vez)

As configurações ficam no armazenamento do navegador do espelho. Os padrões do servidor (A2) já ligam a ponte. Confira uma vez:

1. Inicie o perfil de teste (A6) e abra `https://192.0.2.10:4443/settings` no mesmo Electron. Por exemplo, ponha esse endereço na `url` do módulo por um momento.
2. Em **Modelos**, escolha a `eva-ruiva`.
3. Em **Modelos > VRM > Lip sync**, confira "Brazilian Portuguese text" e a abertura.
4. Em **Módulos > NeoAlice Bridge**, confira: ponte ligada, site `airi-avatar`, site do humor `magicmirror`, fala do espelho ligada, modo de fala "Play the audio that NeoAlice sends".
5. Volte a `url` do módulo para `/mirror`.

### A6. Rodar o perfil de teste

1. Pare o MagicMirror de produção (por exemplo, `pm2 stop MagicMirror`).
2. Inicie o perfil de teste:

   ```bash
   cd ~/MagicMirror && MM_CONFIG_FILE=config/config.airi-teste.js npm run start
   ```

Só um avatar pode rodar por vez. O `MMM-AvatarMQTT` não está no perfil de teste, então não há duas vozes.

### A7. Testes no espelho

Publique cada comando e confira o resultado. `S` é o site do espelho.

```bash
S=neoalice/v1/magicmirror
```

| # | Comando | Resultado esperado |
| --- | --- | --- |
| 1 | Conversa de verdade com a Alice | Ela fala uma vez, com a boca em português. A boca fecha em "p", "b" e "m". |
| 2 | `mosquitto_pub -h 192.0.2.10 -t "$S/evt/mood" -m '{"mood":"happy"}'` | Rosto feliz, que fica até o próximo humor |
| 3 | Uma fala com o humor feliz | A boca fala sem o sorriso largo. Os olhos continuam felizes. |
| 4 | `mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/emoji" -m '{"emoji":"\ud83d\udc4b"}'` | Movimento "Wave Hello" (o emoji de aceno, U+1F44B, em escape JSON) |
| 5 | `mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/gesture" -m '{"gesture":"handup","duration":3}'` | Mão para cima por 3 s |
| 6 | `mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/pose" -m '{"pose":"sitting"}'`, depois `{"pose":"straight"}` | Senta e levanta |
| 7 | `mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/animation" -m '{"url":"animations/Wave_Hello.fbx","duration":4}'` | Animação por 4 s |
| 8 | `mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/gesture" -m '{"gesture":"head_nod"}'` | Movimento embutido "Head Nod" |
| 9 | Alguém entra na frente da câmera | Ela fala a saudação da NeoAlice, com a boca, e acena |
| 10 | 10 minutos com `?stats=1` | fps estável. Anote o valor. |

Grave o tráfego do teste:

```bash
timeout 600 mosquitto_sub -h 192.0.2.10 -v -t 'neoalice/v1/#' > ~/mqtt-teste-airi.log
```

### A8. Critérios para a troca definitiva

1. Os 10 testes de A7 passaram.
2. O perfil de teste rodou por alguns dias (você decide quantos) sem travar, sem fala dupla e sem fala perdida.
3. A volta (A10) foi testada uma vez.

### A9. Troca definitiva

1. Faça o backup de novo (A1, passo 2).
2. Copie o perfil de teste para a produção:

   ```bash
   cp ~/MagicMirror/config/config.airi-teste.js ~/MagicMirror/config/config.js
   ```

3. Reinicie o MagicMirror e repita os testes 1, 2 e 4 de A7.

O `MMM-AvatarMQTT` e o servidor TalkingHead continuam no disco como reserva. O AIRI ainda usa o TalkingHead para os FBX de terceiros (`AIRI_TALKINGHEAD_UPSTREAM`).

### A10. Volta ao avatar antigo

```bash
cp ~/MagicMirror/config/config.js.antes-airi ~/MagicMirror/config/config.js
```

Reinicie o MagicMirror. A NeoAlice não mudou, então o avatar antigo volta como era.

### A11. Problemas comuns no espelho

| Sintoma | Causa e solução |
| --- | --- |
| Tela preta no lugar do avatar | Certificado não confiável (A3), ou a URL errada. Abra a URL no Chromium do espelho para ver o erro. |
| Avatar sem voz | O áudio está bloqueado (A4, passo 4), ou o modo de fala da ponte está em "Silent" (A5). |
| Fala dupla | O `MMM-AvatarMQTT` ainda está carregado, ou duas páginas do AIRI estão abertas no mesmo site. |
| Boca sem português | Em "Lip sync", o modo é "Audio only", ou a NeoAlice mandou o `cmd/tts/audio` sem `text` (B6). |
| "WebGL unavailable" | A GPU do espelho está desligada. No Raspberry Pi, ligue o driver `vc4-kms-v3d`. |
| Um FBX de terceiros não toca | `AIRI_TALKINGHEAD_UPSTREAM` está vazio, ou o servidor TalkingHead está parado. |

## 5. Regra para a Parte B

Cada mudança na NeoAlice segue o protocolo do `PROMPT_BACKEND_FIM_DE_TURNO_E_HUMOR.md`:

1. Backup do código (tag git `backup/<mudanca>-pre`).
2. Testes e gravação do tráfego antes.
3. A mudança, sem remover nem renomear campos existentes.
4. Testes e gravação do tráfego depois.
5. Validação com os critérios da mudança.
6. Volta, se um critério falhar.
7. Pergunta ao responsável antes de reiniciar um contêiner em produção.

Faça uma mudança por vez, na ordem da tabela. Cada uma tem a sua aprovação.

## 6. Parte B — Mudanças na NeoAlice

| # | Mudança | Arquivo provável | Por quê | Teste |
| --- | --- | --- | --- | --- |
| B1 | Publicar o humor em `evt/mood` e `cmd/evt/mood` com `emoji` e, quando houver, `pose` | `services/avatar_client.py` | Rosto nítido na hora (Planejamento 08, componente 1) | `mosquitto_sub -t 'neoalice/v1/+/evt/mood'` mostra o campo `mood` igual ao de antes, mais `emoji` |
| B2 | Confirmar `mood_projection = True` | `config.py` | Sem ele, o humor não sai | O log mostra a publicação de humor |
| B3 | Iniciar `AvatarAnimationSkillExtended` com tratamento de erro e log claro | `dependencies.py` | Hoje uma falha nessa skill fica silenciosa | O log da subida mostra a skill pronta, ou o erro com a causa |
| B4 | Presença: mais de 3 min sem ninguém manda `cmd/avatar/pose {"pose":"sitting"}`. Presença ou porta aberta manda `{"pose":"straight"}` e `cmd/avatar/gesture {"gesture":"handup"}`. | `integrations/door_sensor_vision.py` | O AIRI não decide sentar (decisão de 07/11). Os sensores do Home Assistant só chegam à NeoAlice. | Sair da sala por 3 min: ela senta. Voltar: levanta e levanta a mão. |
| B5 | Mandar sempre o áudio pronto (Kokoro) em `cmd/tts/audio`, e não só o texto em `cmd/tts/say` | gerador de fala do satélite | O espelho fica sem internet (sem Google TTS) | Nenhum `cmd/tts/say` no tráfego de uma conversa |
| B6 | Mandar no `cmd/tts/audio` o campo `text` igual ao que foi falado, sem markdown, emoji ou links | gerador de fala do satélite | O lip sync em português usa esse texto. Um texto diferente do áudio dessincroniza a boca. | O `text` de 5 falas bate com o áudio |
| B7 | Pedir os movimentos embutidos pelo nome em `cmd/avatar/gesture`: `wave_hello`, `head_nod`, `head_shake`, `bow`, `celebrate`, `thinking`, `point_forward`, `arms_open`, `look_around`, `greeting`, `peace_sign`, `spin`, `model_pose`, `squat`, `show_full_body` | skill de animação | O AIRI já toca esses nomes. A NeoAlice escolhe o gesto pelo sentido da resposta, melhor que as regras de texto do AIRI. | `{"gesture":"head_nod"}` faz o aceno de cabeça |
| B8 | Fim de turno `evt/dialog/turn_end` e humor completo (`energy`, `cause`, `eventId`) | orchestrator, satellite_gateway, MoodSystem | Contagem exata de turnos no companion, e humor com intensidade | Critérios do `PROMPT_BACKEND_FIM_DE_TURNO_E_HUMOR.md` |
| B9 | Publicar `cmd/avatar/widget` e `cmd/avatar/tool`, e ler `evt/avatar/tool_result` | skill de widgets | Widgets pedidos pela NeoAlice (Planejamento 07, W5). O AIRI já ouve. | Um pedido de clima abre o widget no desktop |
| B10 | Ligar o `evt/state` do avatar e aceitar o site `airi-avatar` em `/satellites/active` | satellite_gateway | Avisos gerais chegam ao avatar sem a fala do espelho (decisão 1 do Planejamento 06) | O avatar aparece na lista de satélites ativos |
| B11 | Usar o Whisper na NPU (porta 9200) | configuração do STT | Hoje a resposta por voz leva até 115 s. O gargalo é o Whisper na CPU. | Tempo da pergunta à fala abaixo de 30 s |

Depois de B10, a fala do espelho pode ir direto para o `airi-avatar`. Então desligue `AIRI_DEFAULT_NEOALICE_MIRROR_SPEECH`. Enquanto o `magicmirror` receber a fala, o AIRI toca a fala desse site.

### Exemplos de payload

B1, humor com emoji. O emoji vai como escape JSON, aqui o sorriso (U+1F60A):

```json
{ "mood": "happy", "emoji": "\ud83d\ude0a", "pose": "arms_open" }
```

B6, fala com o texto:

```json
{ "audio": { "b64": "<WAV em base64>" }, "text": "Bom dia! Hoje vai fazer sol.", "session_id": "<sessão>" }
```

B7, movimento embutido:

```json
{ "gesture": "wave_hello", "duration": 3 }
```

## 7. Fases que faltam no AIRI

| Fase | Entrega | Muda a NeoAlice |
| --- | --- | --- |
| F1 | Validação com a NeoAlice real (A7) | Não |
| W1 e W2 | Compartilhar a tela com a Alice pelo modelo de visão local (Planejamento 07). Falta o endereço do modelo de visão. | Não |
| M5 | Componente 3 do Planejamento 08 (`MMM-AvatarMQTT`). Só vale se o espelho voltar ao avatar antigo. | Não |
| L2 | Lip sync com o tempo de cada palavra: se a NeoAlice mandar `words` e `wtimes`, como o TalkingHead aceita, o AIRI pode usar esses tempos em vez de seguir as pausas do áudio | Sim (opcional, depois de B6) |
