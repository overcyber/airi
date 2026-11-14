# Planejamento 13 — Desktop, Android, pose `dance` e Neptuna

**Data:** 14/11/2026
**Branch:** `claude/plano-13-apps-dance-neptuna`, a partir de `claude/plano-12-poses-dinamicas`.
**Backup:** o arquivo `airi-backup-antes-plano-13.bundle`.

## 1. Causa comum do desktop e do Android

O app desktop (Tamagotchi) e o app Android não são servidos pelo servidor Alice (`airi-web`). Por isso, sem o endereço do servidor:

- **Chat e áudio:** não há LLM, voz (TTS) nem transcrição (STT). O chat de texto e o áudio falham.
- **MQTT:** a ponte NeoAlice fica desligada, sem site, e com o broker do próprio aparelho. Nenhum comando chega, nem o modo noite.
- **Modelos:** a lista de modelos do servidor (Eva) e as animações do servidor não aparecem.

O código do modo noite é o mesmo do `/mirror`. Ele não funcionava no desktop porque a ponte não estava conectada.

## 2. Correções de código

| Problema | Correção |
| --- | --- |
| A Eva nunca aparecia no desktop e no Android | A lista de modelos usa o servidor salvo, não a página |
| O broker padrão era `ws://localhost:9001` | O broker padrão é o `/mqtt` do servidor da compilação (`VITE_AIRI_SERVER_URL`) |
| "Carregar configurações do servidor" não ligava a ponte quando o servidor não tinha site | Ele liga a ponte com o broker do servidor, lê o site `magicmirror`, e dá ao aparelho o site `airi-desktop` ou `airi-android` |
| Não dava para girar o avatar no celular | Um dedo gira a câmera, e dois dedos dão zoom |
| `android-apk.sh` compilava sem o endereço do servidor | `ALICE_SERVER_URL=http://<ip>:4173 deploy/alice/scripts/android-apk.sh` grava o endereço no APK |

## 3. O que fazer em cada app

Em Configurações > Módulos > Ponte NeoAlice:

1. Preencha **Alice server URL** com `http://<ip-do-servidor>:4173` (a porta HTTP).
2. Aperte **Carregar configurações do servidor**.
3. Confira se a ponte está ligada e o status está "conectado".

**Outras opções:**

- **Desktop:** compile com `apps/stage-tamagotchi/.env.local` contendo `VITE_AIRI_SERVER_URL=http://<ip>:4173`.
- **Android:** compile com `ALICE_SERVER_URL` (seção 2).
- **Servidor:** com `AIRI_DEFAULT_NEOALICE_SITE` e `AIRI_DEFAULT_NEOALICE_ENABLED=true` no `.env`, todo app que carregar as configurações já sai com a ponte ligada.

## 4. Pose `dance` e nomes antigos

- No espelho antigo, `dance` era um FBX parado (`poses/dance.fbx`) da página do TalkingHead. Pelo MQTT ele também não funcionava.
- Agora `{"pose":"dance"}` toca a dança do espelho (Rumba) em loop, pelo `duration` (10 s se não vier).
- `ArmsOpen` e `TwoKnees` encontram as poses `arms_open` e `kneel`.
- Os nomes de animação do espelho antigo (`rumba`, `laugh`, `cry`, `nod`, `shake`, `lookaround`...) e os arquivos do servidor tocam como pose ou gesto, pelo tempo pedido.

## 5. Neptuna

`evidencias/D13/neptuna-poses-gestos.png` mostra a Neptuna (VRM 0.x do VRoid) com o código real:

- 7 poses: `straight`, `hip`, `sitting`, `kneel`, `thinking`, `arms_open`, `bow`;
- 8 gestos: `namaste`, `thumbup`, `point`, `think`, `wave`, `handup`, `celebrate`, `open`;
- o deitar;
- uma pose criada por ossos.

Todos funcionam.

A diferença que aparece nos apps desktop e Android é a da seção 1: sem o servidor, as animações do servidor e a fala não existem lá. O rosto da Neptuna só tem os presets do VRoid, então as expressões são mais simples que as da Eva.

## 6. Verificação e limites

- **Testes:** `alice-motion` 114 e os testes de `stage-ui` dos arquivos alterados passam. `vue-tsc` está limpo em `stage-ui` e `stage-pocket`.
- **Não testado aqui:** um aparelho Android real (permissão do microfone, som, MQTT na rede local) e o app desktop empacotado. O container da sessão não tem aparelho nem tela para o Electron.
