# Migração do avatar do MagicMirror para o AIRI

Este guia troca o avatar antigo do espelho (`MMM-AvatarMQTT` com TalkingHead) pelo avatar 3D do AIRI (`MMM-AiriStage`).
A NeoAlice não muda. O avatar antigo fica no disco, e a volta leva um minuto (passo 11).

Os endereços são de exemplo. Troque pelos da sua rede:

| Papel | Exemplo | Portas |
| --- | --- | --- |
| Servidor: Docker do AIRI, broker, NeoAlice, TalkingHead | `192.0.2.10` | 4443 (AIRI HTTPS), 4173 (AIRI HTTP), 1883 (MQTT), 1884 (MQTT WebSocket), 8081 (TalkingHead) |
| Espelho: MagicMirror | `192.0.2.20` | 8080 (MagicMirror) |

O espelho e o servidor podem ser a mesma máquina. Nesse caso, use `localhost`.

## O que o avatar novo faz

| Recurso | Comportamento |
| --- | --- |
| Fala | Toca o `cmd/tts/audio` do site `magicmirror` e do site `airi-avatar`. A mesma fala nos dois sites toca uma vez só. |
| Boca | Lê o texto da fala com regras do português do Brasil. Fecha em p, b e m. Os números viram palavras. A velocidade se ajusta à voz. |
| Humor | `evt/mood` muda o rosto até o próximo humor. Enquanto ela fala, o humor sai da boca e fica nos olhos e nas sobrancelhas. |
| Gestos e emoji | `cmd/avatar/gesture` e `cmd/avatar/emoji`, com os gestos do TalkingHead e os movimentos do AIRI (por exemplo `wave_hello` e `head_nod`) |
| Poses | `cmd/avatar/pose` dura o `duration` da mensagem, ou 10 s sem ele. Depois ela volta ao normal. `straight` volta na hora. |
| Animações | `cmd/avatar/animation` com a URL do TalkingHead. O AIRI tenta o Docker do AIRI e depois a URL original. |
| Sentar e levantar | O AIRI não decide sozinho. A NeoAlice manda a pose. |

## 1. Backup (no espelho)

1. Copie a configuração de produção:

   ```bash
   cp ~/MagicMirror/config/config.js ~/MagicMirror/config/config.js.antes-airi
   ```

2. Grave 2 minutos do tráfego atual, para comparar depois:

   ```bash
   timeout 120 mosquitto_sub -h 192.0.2.10 -v -t 'neoalice/v1/#' > ~/mqtt-antes-airi.log
   ```

Confira: o arquivo `config.js.antes-airi` existe, e o log tem linhas `neoalice/v1/`.

## 2. Atualizar o AIRI (no servidor)

1. Atualize os repositórios. O `talkinghead-neoalice` fica ao lado do `airi`:

   ```bash
   cd ~/airi && git pull
   ```

   ```bash
   cd ~/talkinghead-neoalice && git pull
   ```

2. Rode o preparo:

   ```bash
   cd ~/airi && deploy/alice/scripts/preparar.sh
   ```

   O script:
   - cria o `.env` e os certificados;
   - converte a Eva ruiva para `deploy/alice/modelos/eva-ruiva.vrm`;
   - copia as animações do TalkingHead para `deploy/alice/animacoes/`;
   - preenche `AIRI_TALKINGHEAD_UPSTREAM` quando a porta 8081 da máquina responde.

## 3. Conferir o `.env` (no servidor)

Abra `deploy/alice/.env` e confira:

| Variável | Valor | Para que serve |
| --- | --- | --- |
| `AIRI_TLS_NAMES` | `192.0.2.10` e o nome da máquina | Endereços aceitos no certificado |
| `AIRI_MQTT_WS_UPSTREAM` | `host.docker.internal:1884` | Caminho do `/mqtt` da página até o listener WebSocket do broker |
| `AIRI_TALKINGHEAD_UPSTREAM` | `http://192.0.2.10:8081` | Animações que não estão em `animacoes/` |
| `AIRI_DEFAULT_NEOALICE_ENABLED` | `true` | Liga a ponte sem abrir as configurações |
| `AIRI_DEFAULT_NEOALICE_SITE` | `airi-avatar` | Site próprio do avatar |
| `AIRI_DEFAULT_NEOALICE_MOOD_SITE` | `magicmirror` | Humor, gestos e poses do espelho |
| `AIRI_DEFAULT_NEOALICE_MIRROR_SPEECH` | `true` | Toca a fala que a NeoAlice manda ao espelho |
| `AIRI_DEFAULT_NEOALICE_SPEECH_MODE` | `neoalice-audio` | Toca o áudio da NeoAlice |
| `AIRI_DEFAULT_NEOALICE_VOICE_INPUT` | `false` | O espelho já tem o microfone do satélite ReSpeaker |

## 4. Subir e testar o Docker (no servidor)

1. Suba:

   ```bash
   docker compose -f deploy/alice/compose.yaml up -d --build
   ```

2. Confira a saúde:

   ```bash
   curl -fsS http://127.0.0.1:4173/healthz
   ```

3. Confira a animação de teste:

   ```bash
   curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4173/poses/dance.fbx
   ```

   A resposta deve ser `200`. Com `404`, rode o passo 2 de novo, ou preencha `AIRI_TALKINGHEAD_UPSTREAM`.

4. Abra `https://192.0.2.10:4443/mirror` num navegador. A Eva deve aparecer.

Volta deste passo: `docker compose -f deploy/alice/compose.yaml down`. O espelho ainda não mudou.

## 5. Confiar no certificado (no espelho)

O MagicMirror usa o Electron, que confia nas autoridades do sistema.

1. Baixe a autoridade local:

   ```bash
   curl -o /tmp/airi-local-ca.crt http://192.0.2.10:4173/airi-local-ca.crt
   ```

2. Instale no sistema (Debian, Ubuntu e Raspberry Pi OS):

   ```bash
   sudo cp /tmp/airi-local-ca.crt /usr/local/share/ca-certificates/airi-local-ca.crt
   ```

   ```bash
   sudo update-ca-certificates
   ```

3. Se o aviso de certificado continuar, instale também no banco do Chromium do usuário:

   ```bash
   certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n airi-local-ca -i /tmp/airi-local-ca.crt
   ```

Confira: `curl https://192.0.2.10:4443/healthz` no espelho responde sem `-k`.

Com o espelho e o servidor na mesma máquina, use `http://localhost:4173/mirror` e pule este passo.

## 6. Instalar o módulo (no espelho)

1. Atualize e copie o módulo:

   ```bash
   cd ~/MMM-avatar-3d && git pull
   ```

   ```bash
   cp -r ~/MMM-avatar-3d/MMM-AiriStage ~/MagicMirror/modules/
   ```

2. Crie o perfil de teste, a partir da produção:

   ```bash
   cp ~/MagicMirror/config/config.js ~/MagicMirror/config/config.airi-teste.js
   ```

3. Em `config.airi-teste.js`, apague o bloco do `MMM-AvatarMQTT` e ponha este no lugar:

   ```text
   {
       module: "MMM-AiriStage",
       position: "fullscreen_below",
       config: {
           url: "https://192.0.2.10:4443/mirror?mouth=0.6",
           allow: "autoplay; microphone"
       }
   },
   ```

4. No mesmo arquivo, no nível de `address` e `port`, libere o áudio sem clique:

   ```text
   electronSwitches: ["autoplay-policy=no-user-gesture-required"],
   ```

Parâmetros da URL do `/mirror`:

| Parâmetro | Efeito |
| --- | --- |
| `mouth=0.6` | Abertura da boca, de 0,2 a 1. Use 0,8 para ver de longe. |
| `view=bust` | Só cabeça e peito. Sem ele, o corpo inteiro aparece. |
| `stats=1` | Mostra quadros por segundo e custo por quadro |

## 7. Rodar o perfil de teste (no espelho)

1. Pare o MagicMirror de produção, por exemplo:

   ```bash
   pm2 stop MagicMirror
   ```

2. Inicie o perfil de teste:

   ```bash
   cd ~/MagicMirror && MM_CONFIG_FILE=config/config.airi-teste.js npm run start
   ```

Só um avatar pode rodar por vez. O perfil de teste não tem o `MMM-AvatarMQTT`, então não há duas vozes.

Na primeira vez, abra `https://192.0.2.10:4443/settings` no mesmo navegador do espelho. Para isso, ponha esse endereço na `url` do módulo por um momento. Confira:

- **Modelos:** a `eva-ruiva` está escolhida.
- **Modelos, VRM, Lip sync:** "Brazilian Portuguese text".
- **Módulos, NeoAlice Bridge:** a ponte está ligada, o site é `airi-avatar`, o site do humor é `magicmirror`, a fala do espelho está ligada e o modo de fala é "Play the audio that NeoAlice sends".

Depois volte a `url` do módulo para `/mirror`.

## 8. Testar (de qualquer máquina da rede)

```bash
S=neoalice/v1/magicmirror
```

| # | Comando | Resultado esperado |
| --- | --- | --- |
| 1 | Uma conversa de verdade com a Alice | Ela fala uma vez. A boca acompanha o português e fecha em p, b e m. |
| 2 | `mosquitto_pub -h 192.0.2.10 -t "$S/evt/mood" -m '{"mood":"happy"}'` | Rosto feliz até o próximo humor |
| 3 | Uma fala com o humor feliz | A boca fala sem o sorriso largo. Os olhos continuam felizes. |
| 4 | `mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/gesture" -m '{"gesture":"handup","duration":3}'` | Mão para cima por 3 s |
| 5 | `mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/gesture" -m '{"gesture":"wave_hello"}'` | Aceno do movimento "Wave Hello" |
| 6 | `mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/pose" -m '{"pose":"thinking"}'` | Pensa por 10 s e volta ao normal |
| 7 | `mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/pose" -m '{"pose":"sitting","duration":30}'` | Senta por 30 s e levanta |
| 8 | `mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/animation" -m '{"url":"http://192.0.2.10:8081/poses/dance.fbx","duration":15}'` | Pose de dança por 15 s. O `dance.fbx` é uma pose parada. |
| 9 | `mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/animation" -m '{"url":"http://192.0.2.10:8081/animations/Rumba.fbx","duration":8}'` | Rumba por 8 s |
| 10 | Alguém entra na frente da câmera | Ela fala a saudação da NeoAlice e acena |
| 11 | 10 minutos com `?stats=1` na URL | Quadros por segundo estáveis. Anote o valor. |

Durante o teste, grave o tráfego:

```bash
timeout 600 mosquitto_sub -h 192.0.2.10 -v -t 'neoalice/v1/#' > ~/mqtt-teste-airi.log
```

## 9. Critérios para a troca definitiva

1. Os 11 testes do passo 8 passaram.
2. O perfil de teste rodou alguns dias sem travar, sem fala dupla e sem fala perdida. Você decide quantos dias.
3. A volta (passo 11) foi testada uma vez.

## 10. Troca definitiva (no espelho)

1. Copie o perfil de teste para a produção:

   ```bash
   cp ~/MagicMirror/config/config.airi-teste.js ~/MagicMirror/config/config.js
   ```

2. Reinicie o MagicMirror, por exemplo:

   ```bash
   pm2 restart MagicMirror
   ```

3. Repita os testes 1, 2 e 5 do passo 8.

O `MMM-AvatarMQTT` e o servidor TalkingHead continuam instalados. O AIRI ainda usa o TalkingHead para as animações de terceiros.

## 11. Volta ao avatar antigo (no espelho)

```bash
cp ~/MagicMirror/config/config.js.antes-airi ~/MagicMirror/config/config.js
```

```bash
pm2 restart MagicMirror
```

A NeoAlice não mudou, então o avatar antigo volta como era.

## 12. Problemas comuns

| Sintoma | Causa e solução |
| --- | --- |
| Tela preta no lugar do avatar | O certificado não é confiável (passo 5), ou a URL está errada. Abra a URL no Chromium do espelho para ver o erro. |
| Avatar sem voz | O áudio está bloqueado (passo 6, item 4), ou o modo de fala da ponte está em "Silent" (passo 7). |
| Fala dupla | O `MMM-AvatarMQTT` ainda está carregado, ou há duas páginas do AIRI abertas no mesmo site. |
| A boca não segue o português | Em "Lip sync", o modo está em "Audio only". Ou a NeoAlice mandou o `cmd/tts/audio` sem `text`. |
| A animação não toca | O teste 3 do passo 4 respondeu `404`, e `AIRI_TALKINGHEAD_UPSTREAM` está vazio. |
| "WebGL unavailable" | A GPU está desligada. No Raspberry Pi, ligue o driver `vc4-kms-v3d` em `/boot/firmware/config.txt`. |
| A pose fica muito tempo | A NeoAlice mandou um `duration` longo. Sem `duration`, a pose dura 10 s. |

## Depois da migração

As mudanças na NeoAlice ficam para depois da troca definitiva e da aprovação de cada uma.
Estão em `docs/alice-motion-engine/PLANEJAMENTO_09_MIGRACAO_MAGICMIRROR_E_NEOALICE.md`, Parte B.
