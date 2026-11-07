# Planejamento 08 — Semblante de humor e movimentos automáticos

> Data: 06/11/2026. Complementa os Planejamentos 06 (AIRI como rosto da NeoAlice) e 07 (widgets e tela).
> Origem: plano do responsável "Restauração do Semblante de Humor e Movimentos Automáticos no MagicMirror".
> Os endereços da rede do responsável estão trocados por valores de exemplo (`192.0.2.x`), porque este repositório é público.

## 1. Objetivo do responsável

1. O rosto do avatar muda de forma nítida, na hora, com o humor da Alice.
2. O avatar se move sozinho:
   - senta depois de um tempo sem ninguém na sala;
   - levanta e cumprimenta quando alguém chega (câmera, radar mmWave, sensor de porta);
   - gesticula enquanto a Alice fala.
3. Os gestos, as poses e as animações que a NeoAlice manda funcionam no avatar novo como no TalkingHead.

## 2. Plano do responsável (NeoAlice e MagicMirror)

| Componente | Arquivo | Mudança |
| --- | --- | --- |
| 1. Backend NeoAlice | `services/avatar_client.py` | Publicar o humor em `evt/mood` e em `cmd/evt/mood`, e mandar o emoji do humor (`MOOD_TO_EMOJI`) junto, com a pose do humor quando houver. |
| 1. Backend NeoAlice | `config.py` | Confirmar `mood_projection = True`. |
| 1. Backend NeoAlice | `dependencies.py` | Iniciar `AvatarAnimationSkillExtended` com tratamento de erro e log claro. |
| 2. Presença | `integrations/door_sensor_vision.py` | Mais de 3 min sem presença: `trigger_avatar_pose("sitting")` e rosto neutro. Presença ou porta aberta: `trigger_avatar_pose("straight")` e `trigger_avatar_gesture("handup")`. |
| 3. MagicMirror | `node_helper.js` | Assinar `neoalice/v1/+/evt/mood` e `neoalice/v1/+/cmd/evt/mood`. |
| 3. MagicMirror | `MMM-AvatarMQTT.js` | Em `applyMood`, chamar também `head.speakEmoji(...)` com o emoji do humor. |

Verificação do plano: `py_compile` dos quatro arquivos, `docker restart neoalice-api` (3 a 5 s), o checklist das quatro redes Docker e do DNS dos serviços, e os testes MQTT de humor, emoji e pose.

**Regra deste repositório:** a NeoAlice só muda depois de o avatar novo ser aprovado (Planejamento 06, F6). Por isso, os componentes 1, 2 e 3 ficam pendentes. Tudo o que o AIRI pode fazer sozinho, lendo o MQTT, já está feito (seção 3).

## 3. O que o AIRI faz, sem mudar a NeoAlice (06/11/2026)

| Pedido | No AIRI | Onde |
| --- | --- | --- |
| Rosto nítido com o humor | O humor move a expressão do VRM e as formas ARKit das linhas de base do TalkingHead (tristeza, raiva, medo). O rosto fica até o próximo humor. O último humor volta ao recarregar a página. | `mood-face.ts`, `use-neoalice-stage-bridge.ts` |
| Emoji junto do humor | Um `cmd/avatar/emoji` faz uma reação no rosto, também com as formas ARKit. Mais emojis têm rosto: 😂 😜 🤩 🥳 (feliz), 🤔 🤨 (pensar), 😨 😳 (susto), 😴 😌 (calma). | `emotionOfEmoji`, `mood-face.ts` |
| Sentar sem ninguém | Depois de N minutos sem pessoa nas câmeras da NeoAlice, o avatar senta (`sitting`). Padrão: 3 min. 0 desliga. Só funciona depois de uma câmera mandar uma pessoa. | Configuração "Minutes without anyone before she sits down" da ponte |
| Levantar e cumprimentar | A primeira pessoa depois da ausência: `straight`, `handup` e sorriso. Uma pessoa depois de 60 s sem ninguém, sem ter sentado: aceno e sorriso. | `use-neoalice-stage-bridge.ts` |
| Gestos e poses da NeoAlice | São os modelos do TalkingHead (nativos e da NeoAlice), convertidos pelo mesmo retarget das FBX. `mirror`, `duration` e a transição de 1 s valem. Uma pose fica até a próxima. | `talkinghead-templates.ts`, `talkinghead-motion.ts` |
| Gesticular durante a fala (M1) | Cada fala usa uma das FBX `Talking_0`, `Talking_1` e `Talking_2` do servidor, diferente da fala anterior. Sentada, ela fala sem levantar. | `avatar-animator.ts` (`setTalkingPool`), `vrm-motions.ts` |
| Animações por URL | `cmd/avatar/animation` toca o arquivo da URL em loop pela duração. Uma URL em `animations/`, `animations_arkit/` ou `poses/` carrega do servidor Alice, no mesmo caminho. | `neoalice-animation-url.ts`, `deploy/alice` |

Evidência do teste no navegador (Eva, VRM 1.0), comparada com o TalkingHead real com a mesma Eva em GLB:

- Ficam iguais: `handup`, `wave` com `mirror`, `point`, as poses `hip`, `arms_open` e `sitting`.
- `celebrate` deixa os braços para baixo também no TalkingHead. O defeito está no modelo do `custom_moves.json`.
- `bow`: o AIRI se curva. O TalkingHead quase não se curva, porque mantém a cabeça olhando para a câmera.
- Ausência de teste (6 s): o quadril foi de 1,004 m para 0,117 m (sentada), e voltou a 1,004 m com a pessoa.

## 4. Respostas às perguntas em aberto

| Pergunta | Padrão no AIRI | Como mudar |
| --- | --- | --- |
| 3 ou 5 minutos sem presença para sentar? | 3 minutos | Campo na página da ponte NeoAlice. Vale por navegador. |
| Gesticular em toda fala, ou só em respostas afirmativas ou dúvidas? | Em toda fala (M1) | Decisão do responsável. Sem as FBX `Talking_*` no servidor, ela usa o clipe de fala padrão. |

## 5. Fases que faltam

| Fase | Entrega | Muda a NeoAlice |
| --- | --- | --- |
| M1 | Feito em 06/11: gesticular durante a fala com as FBX `Talking_*`. No teste, duas falas seguidas usaram `Talking_1` e depois `Talking_2`. | Não |
| M2 | Feito em 06/11, para a Eva ruiva (`eva-new-ruiva.glb`). O conversor (`hair-springs.ts`) acha a trança que pende atrás da cabeça (283 vértices, de 1,62 m a 1,35 m), cria uma cadeia de 4 ossos mais a ponta, passa os pesos para ela e declara `VRMC_springBone` com colisores na cabeça, no pescoço, nas costas e nos ombros. O corpo ganhou inércia (`body-inertia.ts`): o peito e a cabeça atrasam quando o quadril gira ou acelera, e assentam com um pequeno balanço. | Não |
| M3 | Página `/mirror` com o corpo inteiro na tela, como a vista `full` do TalkingHead. Hoje a câmera vem das configurações do modelo. Sentada, a Eva fica abaixo do enquadramento do busto. | Não |
| M4 | Componentes 1 e 2 da seção 2 (backend NeoAlice e presença por sensores de porta e radar) | Sim, só depois do avatar aprovado |
| M5 | Componente 3 da seção 2 (`MMM-AvatarMQTT`, o avatar antigo do espelho) | Não muda a NeoAlice. Só vale enquanto o espelho usa o avatar antigo. |

## 6. Correções de 06/11 depois do teste do responsável

- `celebrate`: o modelo do `custom_moves.json` cruzava os braços embaixo, também no TalkingHead. Agora os dois braços sobem, com as mãos acima da cabeça.
- Torção do corpo nos gestos: os idles `idle-2` e `idle-4` viravam a cabeça de 37° a 65°. Com um gesto por cima, o avatar parecia torto. Ficaram só os três idles que olham para a frente.
- Mensagens de câmera sem pessoa não aparecem mais no console, porque as câmeras publicam muitos quadros por segundo.

## 7. Mudanças de 07/11 (F6 aprovada: o AIRI é o avatar do espelho)

- **Fala do espelho:** a NeoAlice manda o que a Alice fala sozinha (saudação da câmera, avisos) para o site `magicmirror` e os satélites ativos, nunca para `airi-avatar`. Antes, o AIRI só lia humor e gestos do `magicmirror`. Agora ele também toca a fala de lá (`mirrorSpeech`, ligado por padrão, `AIRI_DEFAULT_NEOALICE_MIRROR_SPEECH`). A mesma fala que chega em dois sites dentro de 30 s toca uma vez só. Teste: `magicmirror/cmd/tts/audio` tocou, e a cópia em `airi-avatar` foi descartada.
- **FBX:** os 10 movimentos do responsável (`new_moves.py`) estão no repositório, em `packages/stage-ui-three/src/assets/vrm/animations/neoalice/`, e vêm com o app (Web, desktop e Android, sem servidor). Uma URL ou um nome do TalkingHead com o mesmo arquivo toca a cópia do app.
- **FBX de terceiros:** os 9 da biblioteca do Ready Player Me e os 2 do Mixamo não entram neste repositório público. O `airi-web` os pega de `deploy/alice/animacoes`, ou, se faltarem, do servidor TalkingHead (`AIRI_TALKINGHEAD_UPSTREAM=http://<ip>:8081`), no mesmo caminho. Teste: `Rumba.fbx`, `Terrified.fbx` e `dance.fbx` vieram do TalkingHead.

## 8. Decisão do responsável (07/11): as poses vêm só da NeoAlice

O "sentar sem ninguém" do AIRI foi removido. O AIRI não decide sentar nem levantar: com presença nos sensores do Home Assistant, que não chegam ao AIRI, ela ficava sentada. Sentar e levantar por presença é o componente 2 da seção 2 (NeoAlice, `door_sensor_vision.py`), que manda `cmd/avatar/pose` e o AIRI executa. As linhas das seções 3 e 4 sobre sentar no AIRI ficam substituídas por esta decisão.

## 9. Verificação no espelho

1. Rodar `deploy/alice/scripts/preparar.sh`. Ele copia as pastas `animations`, `animations_arkit` e `poses` do TalkingHead para `deploy/alice/animacoes/`.
2. Reconstruir o `airi-web` e recarregar a página `/mirror`.
3. Publicar no site `magicmirror` os comandos do responsável: `namaste` (6 s), `handup`, `shrug`, `wave` com `mirror`, `thumbup`, as poses `arms_open`, `bow`, `thinking`, `sitting` e `straight`, e as animações `Wave_Hello`, `Talking_1`, `Rumba`, `Terrified` e `poses/dance.fbx`.
4. Com as câmeras ligadas, sair da sala por 3 minutos: o avatar senta. Voltar: ela levanta e levanta a mão.
