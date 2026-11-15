# Lista de comandos para testar os movimentos

Cada comando abaixo foi aceito pelo tradutor da ponte (`packages/alice-motion/src/motion-commands.test.ts`). Esse teste lê o arquivo `comandos.json` desta pasta.

Troque o endereço pelo do seu broker:

```bash
BROKER=192.0.2.10
```

Cada linha é um comando para colar no terminal. O avatar precisa estar com a ponte NeoAlice conectada e com o site `magicmirror` como site de humor.

**Ordem sugerida:** teste uma seção, depois mande `straight` (levantar) antes da seguinte.

## Gestos

| Nome | O que faz | Precisa de |
| --- | --- | --- |
| `handup` | Levantar a mao | - |
| `index` | Apontar o indicador para cima | - |
| `ok` | Sinal de OK | - |
| `thumbup` | Joia | - |
| `thumbdown` | Joia para baixo | - |
| `side` | Gesto para o lado | - |
| `wave` | Acenar | - |
| `point` | Apontar para a frente | - |
| `think` | Mao no queixo, pensando | - |
| `shrug` | Dar de ombros (duas maos) | - |
| `namaste` | Maos juntas (duas maos) | - |
| `open` | Abrir os bracos (duas maos) | - |
| `celebrate` | Comemorar com os dois bracos (duas maos) | - |
| `yawn` | Bocejo, com o rosto e o corpo | - |

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"handup"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"index"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"ok"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"thumbup"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"thumbdown"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"side"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"wave"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"point"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"think"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"shrug"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"namaste"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"open"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"celebrate"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"yawn"}'
```

## Gestos (outra mao)

| Nome | O que faz | Precisa de |
| --- | --- | --- |
| `handup espelhado` | Levantar a mao, com a outra mao | - |
| `index espelhado` | Apontar o indicador para cima, com a outra mao | - |
| `ok espelhado` | Sinal de OK, com a outra mao | - |
| `thumbup espelhado` | Joia, com a outra mao | - |
| `thumbdown espelhado` | Joia para baixo, com a outra mao | - |
| `side espelhado` | Gesto para o lado, com a outra mao | - |
| `wave espelhado` | Acenar, com a outra mao | - |
| `point espelhado` | Apontar para a frente, com a outra mao | - |
| `think espelhado` | Mao no queixo, pensando, com a outra mao | - |
| `shrug espelhado` | Dar de ombros (duas maos), com a outra mao | - |
| `namaste espelhado` | Maos juntas (duas maos), com a outra mao | - |
| `open espelhado` | Abrir os bracos (duas maos), com a outra mao | - |
| `celebrate espelhado` | Comemorar com os dois bracos (duas maos), com a outra mao | - |

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"handup","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"index","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"ok","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"thumbup","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"thumbdown","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"side","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"wave","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"point","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"think","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"shrug","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"namaste","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"open","mirror":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"celebrate","mirror":true}'
```

## Poses

| Nome | O que faz | Precisa de |
| --- | --- | --- |
| `straight` | Em pe, reta (volta ao normal) | - |
| `side` | Peso em uma perna | - |
| `hip` | Mao na cintura | - |
| `turn` | Corpo virado de lado | - |
| `back` | De costas | - |
| `wide` | Pernas abertas | - |
| `oneknee` | Um joelho no chao | - |
| `kneel` | De joelhos | - |
| `bend` | Inclinada para a frente | - |
| `sitting` | Sentada no chao | - |
| `thinking` | Em pe, pensando | - |
| `arms_open` | Bracos abertos | - |
| `bow` | Reverencia | - |

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"straight"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"side"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"hip"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"turn"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"back"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"wide"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"oneknee","duration":10}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"kneel","duration":10}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"bend","duration":10}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"sitting","duration":10}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"thinking"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"arms_open"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"bow"}'
```

## Deitar e levantar

| Nome | O que faz | Precisa de |
| --- | --- | --- |
| `lying` | Deitar no chao e dormir (volta sozinha depois da duracao) | - |
| `levantar` | Levantar (pose reta) | - |
| `modo noite ligado` | Modo noite: deita, fecha os olhos e boceja | - |
| `modo noite desligado` | Sai do modo noite: acorda e levanta | - |

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"lying","duration":20}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"straight"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/evt/alice/night_mode' -m '{"active":true}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/evt/alice/night_mode' -m '{"active":false}'
```

## Danca

| Nome | O que faz | Precisa de |
| --- | --- | --- |
| `dance` | Danca (Rumba), 10 s | Rumba.fbx no servidor |
| `dancar` | Danca (Rumba), 15 s | Rumba.fbx no servidor |

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"dance"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"dancar","duration":15}'
```

## Animacoes FBX

| Nome | O que faz | Precisa de |
| --- | --- | --- |
| `idle` | Standing_Idle | arquivo FBX no servidor (Ready Player Me) |
| `talk` | Talking_0 | arquivo FBX no servidor (Ready Player Me) |
| `explain` | Talking_1 | arquivo FBX no servidor (Ready Player Me) |
| `emphatic` | Talking_2 | arquivo FBX no servidor (Ready Player Me) |
| `rumba` | Rumba (danca) | arquivo FBX no servidor (Ready Player Me) |
| `laugh` | Laughing | arquivo FBX no servidor (Ready Player Me) |
| `angry` | Angry | arquivo FBX no servidor (Ready Player Me) |
| `cry` | Crying | arquivo FBX no servidor (Ready Player Me) |
| `fear` | Terrified | arquivo FBX no servidor (Ready Player Me) |
| `wave` | Wave_Hello | - |
| `nod` | Head_Nod | - |
| `shake` | Head_Shake | - |
| `bow` | Bow | - |
| `celebrate` | Celebrate | - |
| `think` | Thinking | - |
| `point` | Point_Forward | - |
| `lookaround` | Look_Around | - |
| `armsopen` | Arms_Open | - |
| `breathe` | Breathing_Idle | - |

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"idle","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"talk","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"explain","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"emphatic","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"rumba","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"laugh","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"angry","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"cry","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"fear","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"wave","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"nod","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"shake","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"bow","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"celebrate","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"think","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"point","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"lookaround","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"armsopen","duration":6}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/animation' -m '{"name":"breathe","duration":6}'
```

## Rosto

| Nome | O que faz | Precisa de |
| --- | --- | --- |
| `emoji sorriso` | Emoji no rosto | - |
| `emoji bocejo` | Emoji de bocejo: boceja | - |

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/emoji' -m '{"emoji":"\ud83d\ude0a"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/emoji' -m '{"emoji":"\ud83e\udd71"}'
```

## Humor

| Nome | O que faz | Precisa de |
| --- | --- | --- |
| `humor brincalhao` | Humor (intensidade 80) | - |
| `humor sonolento` | Humor sonolento | - |

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/evt/mood' -m '{"mood":"Playful","intensity":80}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/evt/mood' -m '{"mood":"Sleepy","intensity":90}'
```

## Movimentos criados (exemplos)

| Nome | O que faz | Precisa de |
| --- | --- | --- |
| `aceno_largo` | Aceno grande com a mao direita, sorrindo | - |
| `abraco_aberto` | Abre os bracos para a frente como quem oferece um abraco | - |
| `pensando_queixo` | Mao direita no queixo, cabeca inclinada | - |
| `aplauso` | Bate palmas na frente do peito, duas vezes | - |
| `espreguicar` | Levanta os dois bracos e arqueia as costas, como quem acorda | - |
| `dancinha_quadril` | Balanca o quadril e os bracos de um lado para o outro | - |
| `sentada_chao` | Senta no chao com as pernas esticadas a frente e os joelhos levemente dobrados | - |
| `surpresa` | So o rosto: surpresa, boca aberta e sobrancelhas altas | - |
| `aceno_talkinghead` | Aceno no formato TalkingHead: radianos nos ossos Ready Player Me, [min,max] sorteia um valor | - |
| `continencia` | Continencia: mao direita na testa, postura firme | - |

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/motion' -m '{"name":"aceno_largo","description":"Aceno grande com a mao direita, sorrindo","kind":"gesture","format":"bones","duration":3.0,"keyframes":[{"t":0,"bones":{"rightUpperArm":{"levantar":10}},"face":{"mouthSmileLeft":0.2,"mouthSmileRight":0.2}},{"t":0.6,"bones":{"rightUpperArm":{"levantar":150,"frente":20},"rightLowerArm":{"dobrar":30},"head":{"lado":8}},"face":{"mouthSmileLeft":0.45,"mouthSmileRight":0.45}},{"t":1.0,"bones":{"rightUpperArm":{"levantar":150,"frente":20},"rightLowerArm":{"dobrar":60},"rightHand":{"desviar":20}}},{"t":1.4,"bones":{"rightUpperArm":{"levantar":150,"frente":20},"rightLowerArm":{"dobrar":20},"rightHand":{"desviar":-10}}},{"t":1.8,"bones":{"rightUpperArm":{"levantar":150,"frente":20},"rightLowerArm":{"dobrar":60},"rightHand":{"desviar":20}}},{"t":3.0,"bones":{"rightUpperArm":{"levantar":10}}}]}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/motion' -m '{"name":"abraco_aberto","description":"Abre os bracos para a frente como quem oferece um abraco","kind":"pose","format":"bones","duration":4.0,"bones":{"leftUpperArm":{"levantar":80,"frente":50},"rightUpperArm":{"levantar":80,"frente":50},"leftLowerArm":{"dobrar":25},"rightLowerArm":{"dobrar":25},"head":{"lado":6},"chest":{"frente":6}},"face":{"mouthSmileLeft":0.5,"mouthSmileRight":0.5,"eyeSquintLeft":0.2,"eyeSquintRight":0.2}}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/motion' -m '{"name":"pensando_queixo","description":"Mao direita no queixo, cabeca inclinada","kind":"pose","format":"bones","duration":5.0,"bones":{"rightUpperArm":{"levantar":45,"frente":95},"rightLowerArm":{"dobrar":130},"rightHand":{"dobrar":-10},"head":{"lado":-10,"frente":6,"girar":-8},"spine":{"lado":3}},"face":{"browInnerUp":0.3,"mouthPressLeft":0.2}}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/motion' -m '{"name":"aplauso","description":"Bate palmas na frente do peito, duas vezes","kind":"gesture","format":"bones","duration":3.0,"keyframes":[{"t":0,"bones":{"leftUpperArm":{"levantar":20},"rightUpperArm":{"levantar":20}}},{"t":0.4,"bones":{"leftUpperArm":{"levantar":50,"frente":80},"rightUpperArm":{"levantar":50,"frente":80},"leftLowerArm":{"dobrar":100},"rightLowerArm":{"dobrar":100}},"face":{"mouthSmileLeft":0.4,"mouthSmileRight":0.4}},{"t":0.6,"bones":{"leftUpperArm":{"levantar":50,"frente":100},"rightUpperArm":{"levantar":50,"frente":100},"leftLowerArm":{"dobrar":100},"rightLowerArm":{"dobrar":100}}},{"t":0.8,"bones":{"leftUpperArm":{"levantar":50,"frente":80},"rightUpperArm":{"levantar":50,"frente":80},"leftLowerArm":{"dobrar":100},"rightLowerArm":{"dobrar":100}}},{"t":1.0,"bones":{"leftUpperArm":{"levantar":50,"frente":100},"rightUpperArm":{"levantar":50,"frente":100},"leftLowerArm":{"dobrar":100},"rightLowerArm":{"dobrar":100}}},{"t":3.0,"bones":{"leftUpperArm":{"levantar":20},"rightUpperArm":{"levantar":20}}}]}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/motion' -m '{"name":"espreguicar","description":"Levanta os dois bracos e arqueia as costas, como quem acorda","kind":"gesture","format":"bones","duration":4.0,"keyframes":[{"t":0,"bones":{"leftUpperArm":{"levantar":10},"rightUpperArm":{"levantar":10}}},{"t":1.2,"bones":{"leftUpperArm":{"levantar":170,"frente":60},"rightUpperArm":{"levantar":170,"frente":60},"chest":{"frente":-15},"spine":{"frente":-10},"head":{"frente":-15}},"face":{"jawOpen":0.35,"eyeBlinkLeft":0.7,"eyeBlinkRight":0.7}},{"t":2.6,"bones":{"leftUpperArm":{"levantar":170,"frente":60},"rightUpperArm":{"levantar":170,"frente":60},"chest":{"frente":-15},"spine":{"frente":-10},"head":{"frente":-15}}},{"t":4.0,"bones":{"leftUpperArm":{"levantar":10},"rightUpperArm":{"levantar":10}}}]}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/motion' -m '{"name":"dancinha_quadril","description":"Balanca o quadril e os bracos de um lado para o outro","kind":"gesture","format":"bones","duration":4.0,"keyframes":[{"t":0,"bones":{"hips":{"lado":0}}},{"t":0.5,"bones":{"hips":{"lado":10,"girar":10},"leftUpperArm":{"levantar":70,"frente":30},"rightUpperArm":{"levantar":40,"frente":30},"chest":{"lado":-6},"head":{"lado":-8}},"face":{"mouthSmileLeft":0.4,"mouthSmileRight":0.4}},{"t":1.0,"bones":{"hips":{"lado":-10,"girar":-10},"leftUpperArm":{"levantar":40,"frente":30},"rightUpperArm":{"levantar":70,"frente":30},"chest":{"lado":6},"head":{"lado":8}}},{"t":1.5,"bones":{"hips":{"lado":10,"girar":10},"leftUpperArm":{"levantar":70,"frente":30},"rightUpperArm":{"levantar":40,"frente":30},"chest":{"lado":-6},"head":{"lado":-8}}},{"t":2.0,"bones":{"hips":{"lado":-10,"girar":-10},"leftUpperArm":{"levantar":40,"frente":30},"rightUpperArm":{"levantar":70,"frente":30},"chest":{"lado":6},"head":{"lado":8}}},{"t":4.0,"bones":{"hips":{"lado":0}}}]}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/motion' -m '{"name":"sentada_chao","description":"Senta no chao com as pernas esticadas a frente e os joelhos levemente dobrados","kind":"pose","format":"bones","duration":6.0,"bones":{"hips":{"subir":-90,"frente":5},"leftUpperLeg":{"frente":88,"lado":8},"rightUpperLeg":{"frente":88,"lado":8},"leftLowerLeg":{"dobrar":15},"rightLowerLeg":{"dobrar":15},"leftUpperArm":{"levantar":25,"frente":70},"rightUpperArm":{"levantar":25,"frente":70},"leftLowerArm":{"dobrar":50},"rightLowerArm":{"dobrar":50},"leftFoot":{"apontar":-10},"rightFoot":{"apontar":-10}}}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/motion' -m '{"name":"surpresa","description":"So o rosto: surpresa, boca aberta e sobrancelhas altas","kind":"gesture","format":"bones","duration":2.5,"keyframes":[{"t":0,"face":{"jawOpen":0}},{"t":0.3,"bones":{"head":{"frente":-8}},"face":{"jawOpen":0.4,"browInnerUp":0.8,"browOuterUpLeft":0.7,"browOuterUpRight":0.7,"eyeWideLeft":0.8,"eyeWideRight":0.8}},{"t":1.6,"bones":{"head":{"frente":-8}},"face":{"jawOpen":0.4,"browInnerUp":0.8,"browOuterUpLeft":0.7,"browOuterUpRight":0.7,"eyeWideLeft":0.8,"eyeWideRight":0.8}},{"t":2.5,"bones":{"head":{"frente":0}},"face":{"jawOpen":0}}]}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/motion' -m '{"name":"aceno_talkinghead","description":"Aceno no formato TalkingHead: radianos nos ossos Ready Player Me, [min,max] sorteia um valor","kind":"gesture","format":"talkinghead","duration":3.0,"props":{"LeftShoulder.rotation":{"x":[1.5,2],"y":[0.2,0.4],"z":[-1.5,-1.3]},"LeftArm.rotation":{"x":[1.5,1.7],"y":[-0.6,-0.4],"z":[1,1.2]},"LeftForeArm.rotation":{"x":-0.815,"y":[-0.4,0],"z":1.575},"LeftHand.rotation":{"x":-0.529,"y":-0.2,"z":0.022}}}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/motion' -m '{"name":"continencia","description":"Continencia: mao direita na testa, postura firme","kind":"pose","format":"bones","duration":4.0,"bones":{"rightUpperArm":{"levantar":95,"frente":60},"rightLowerArm":{"dobrar":140},"rightHand":{"dobrar":0,"desviar":-10},"spine":{"frente":-3},"head":{"frente":-4}},"face":{"mouthPressLeft":0.3,"mouthPressRight":0.3}}'
```

## Controle do celular e do desktop

Estes comandos **só funcionam** com as duas chaves ligadas no app (a chave geral e "Permitir comandos da NeoAlice"). Sem elas, o app recusa e escreve o motivo na lista de ações. A resposta volta em `neoalice/v1/magicmirror/evt/avatar/tool_result`.

| Nome | O que faz |
| --- | --- |
| `celular: ler a tela` | Le o texto e os botoes da tela do celular (Android) |
| `celular: voltar` | Aperta Voltar no celular (Android) |
| `celular: ir para o inicio` | Aperta Inicio no celular (Android) |
| `celular: tocar num ponto` | Toca no ponto x=540, y=1200 da tela (Android) |
| `celular: abrir um app` | Abre o app pelo pacote (Android) |
| `desktop: ver ajuda do controle` | Pede a ajuda do controle do desktop (Tamagotchi) |

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/tool' -m '{"tool":"android_screen_read","args":{},"request_id":"teste-celular-ler-a-tela"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/tool' -m '{"tool":"android_screen_act","args":{"type":"key","key":"back"},"request_id":"teste-celular-voltar"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/tool' -m '{"tool":"android_screen_act","args":{"type":"key","key":"home"},"request_id":"teste-celular-ir-para-o-inicio"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/tool' -m '{"tool":"android_screen_act","args":{"type":"tap","x":540,"y":1200},"request_id":"teste-celular-tocar-num-ponto"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/tool' -m '{"tool":"android_screen_act","args":{"type":"open_app","packageName":"com.android.settings"},"request_id":"teste-celular-abrir-um-app"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/tool' -m '{"tool":"computer_use","args":{"argv":["invoke","--help"]},"request_id":"teste-desktop-ajuda"}'
```
