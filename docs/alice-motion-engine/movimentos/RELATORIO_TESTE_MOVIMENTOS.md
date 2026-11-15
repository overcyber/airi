# Relatorio: teste de todos os movimentos

**Data:** 15/11/2026. **Branch:** `claude/plano-16-dormir-no-chao`.

## O que foi testado e como

Cada movimento foi tocado na Eva e na Neptuna, no navegador (Chromium sem placa de video), com a mesma animacao e o mesmo codigo do app (`stage-ui-three`). De cada movimento foram feitas 4 imagens, em 15%, 40%, 70% e 95% da duracao. O programa conferiu que o movimento carrega, que nenhuma posicao de osso e invalida e que nao houve erro na pagina. Eu olhei todas as imagens.

Total: **81 movimentos, 81 ok na Eva e 81 ok na Neptuna.** Alem disso, os 79 comandos MQTT da lista chegam ao palco: teste automatico em `packages/alice-motion/src/motion-commands.test.ts`.

Imagens: `docs/alice-motion-engine/evidencias/D16/eva-folha-1.png` a `eva-folha-7.png`, e `neptuna-folha-1.png` a `neptuna-folha-7.png`.

## O que este teste NAO prova

- O app instalado no Windows, no Linux e no Android, e a sua rede. Voce disse que vai testar. Para isso, use `LISTA_COMANDOS.md`.
- Som, voz, e a sincronia da boca com a fala.
- Os humores e os emojis do rosto: foram testados nos Planos 10 a 12.
- O movimento fluido. As 4 imagens mostram o inicio, o meio e o fim, nao todos os quadros.

## Problemas achados neste teste, e a correcao

| Problema | Causa | Correcao |
| --- | --- | --- |
| Ela dorme flutuando acima do chao | O levantamento que eu fiz para o desktop valia para todo enquadramento que nao era corpo inteiro, inclusive web e Android | Agora so o desktop liga (`vrm-lift-floor-pose`). Commit `9878ae057`, ja na `main` |
| A danca (`{"pose":"dance"}`) nao tocava na web | A web e HTTPS e pedia o `Rumba.fbx` por `http://<ip>:4173`, bloqueado pelo navegador | `aliceServerOrigin()` usa o servidor da pagina. Commit `6edee881a`, ja na `main` |
| Pose criada por LLM com um braco so: o outro braco virava T | Uma pose segurada apaga a animacao de espera, e o osso sem trilha volta ao T da VRM | `createCustomMotionClip` mantem o braco nao citado caido. 4 testes novos |
| Meu exemplo `sentada_chao` ficava sentada no ar | Joelho dobrado 95 graus com a coxa a frente deixa a canela pendurada | Exemplo corrigido: joelho 15 graus, pernas esticadas |

## Resultado por movimento

### Rosto e corpo

| Movimento | Duracao | Eva | Neptuna | O que se ve |
| --- | --- | --- | --- | --- |
| `bocejo` | 4.03 s | ok | ok | Rosto e corpo do bocejo. Em corpo inteiro o rosto e pequeno: foi conferido de perto no Plano 12. |

### Criados por LLM

| Movimento | Duracao | Eva | Neptuna | O que se ve |
| --- | --- | --- | --- | --- |
| `criado:abraco_aberto` | 4 s | ok | ok | Pose: bracos abertos a frente, sorriso. |
| `criado:aceno_largo` | 3 s | ok | ok | Aceno grande com o braco direito, sorrindo. |
| `criado:aceno_talkinghead` | 3 s | ok | ok | Formato TalkingHead: aceno com o braco esquerdo. |
| `criado:aplauso` | 3 s | ok | ok | Duas palmas na frente do peito. |
| `criado:continencia` | 4 s | ok | ok | Pose: mao direita na testa. O braco esquerdo fica caido (corrigido neste plano). |
| `criado:dancinha_quadril` | 4 s | ok | ok | Balanca quadril, bracos e cabeca. |
| `criado:espreguicar` | 4 s | ok | ok | Levanta os dois bracos e arqueia as costas, com boca aberta. |
| `criado:pensando_queixo` | 5 s | ok | ok | Pose: mao direita no queixo, cabeca inclinada. O braco esquerdo fica caido (corrigido neste plano). |
| `criado:sentada_chao` | 6 s | ok | ok | Pose: sentada no chao, pernas esticadas a frente (de lado). Na Neptuna fica em pe: hips.subir e em centimetros e ela e menor. |
| `criado:surpresa` | 2.5 s | ok | ok | So rosto e cabeca: boca aberta, sobrancelhas altas. |

### FBX que vao no app

| Movimento | Duracao | Eva | Neptuna | O que se ve |
| --- | --- | --- | --- | --- |
| `fbx-app:arms-open` | 3.03 s | ok | ok | Abre e fecha os bracos. |
| `fbx-app:bow` | 3.03 s | ok | ok | Reverencia. |
| `fbx-app:breathing-idle` | 4.03 s | ok | ok | Respira em pe. |
| `fbx-app:celebrate` | 3.03 s | ok | ok | Comemora com os dois bracos. |
| `fbx-app:get-up` | 5.2 s | ok | ok | Levanta do chao em 5,2 s: apoia no braco, senta, ajoelha, fica em pe. |
| `fbx-app:head-nod` | 1.83 s | ok | ok | Balanca a cabeca dizendo sim. |
| `fbx-app:head-shake` | 1.83 s | ok | ok | Balanca a cabeca dizendo nao. |
| `fbx-app:lie-down` | 14 s | ok | ok | Deita de lado em 5 s e descansa no chao (14 s, repete o descanso). |
| `fbx-app:look-around` | 5.03 s | ok | ok | Olha ao redor. |
| `fbx-app:point-forward` | 3.03 s | ok | ok | Aponta para a frente. |
| `fbx-app:thinking` | 4.03 s | ok | ok | Pensa, mao no queixo. |
| `fbx-app:wave-hello` | 3.03 s | ok | ok | Acena. |

### FBX do servidor (animations_arkit)

| Movimento | Duracao | Eva | Neptuna | O que se ve |
| --- | --- | --- | --- | --- |
| `fbx-servidor:Angry` | 19.2 s | ok | ok | Raiva, 19 s. |
| `fbx-servidor:Arms_Open` | 3.03 s | ok | ok | Abre os bracos. |
| `fbx-servidor:Bow` | 3.03 s | ok | ok | Reverencia. |
| `fbx-servidor:Breathing_Idle` | 4.03 s | ok | ok | Respira em pe. |
| `fbx-servidor:Celebrate` | 3.03 s | ok | ok | Comemora. |
| `fbx-servidor:Crying` | 6.3 s | ok | ok | Choro, 6 s. |
| `fbx-servidor:Head_Nod` | 1.83 s | ok | ok | Sim com a cabeca. |
| `fbx-servidor:Head_Shake` | 1.83 s | ok | ok | Nao com a cabeca. |
| `fbx-servidor:Laughing` | 9.8 s | ok | ok | Riso, 10 s. |
| `fbx-servidor:Look_Around` | 5.03 s | ok | ok | Olha ao redor. |
| `fbx-servidor:Point_Forward` | 3.03 s | ok | ok | Aponta. |
| `fbx-servidor:Rumba` | 2.4 s | ok | ok | Dança (a pose "dance" toca esta). |
| `fbx-servidor:Standing_Idle` | 6.03 s | ok | ok | Em pe, parada. |
| `fbx-servidor:Talking_0` | 5.97 s | ok | ok | Fala, gesto 1. |
| `fbx-servidor:Talking_1` | 3.97 s | ok | ok | Fala, gesto 2. |
| `fbx-servidor:Talking_2` | 5.2 s | ok | ok | Fala, gesto 3. |
| `fbx-servidor:Terrified` | 20.03 s | ok | ok | Susto, 20 s. |
| `fbx-servidor:Thinking` | 4.03 s | ok | ok | Pensa. |
| `fbx-servidor:Wave_Hello` | 3.03 s | ok | ok | Acena. |

### Gestos TalkingHead

| Movimento | Duracao | Eva | Neptuna | O que se ve |
| --- | --- | --- | --- | --- |
| `gesto:celebrate` | 3 s | ok | ok | Os dois bracos para o alto. |
| `gesto:handup` | 3 s | ok | ok | Levanta a mao, dedos abertos. |
| `gesto:index` | 3 s | ok | ok | Indicador para cima. |
| `gesto:namaste` | 3 s | ok | ok | Maos juntas na frente do peito, dedos juntos. |
| `gesto:ok` | 3 s | ok | ok | Sinal de OK. |
| `gesto:open` | 3 s | ok | ok | Os dois bracos abertos. |
| `gesto:point` | 3 s | ok | ok | Aponta para a frente. |
| `gesto:shrug` | 3 s | ok | ok | Ombros e maos abertas. |
| `gesto:side` | 3 s | ok | ok | Mao aberta para o lado. |
| `gesto:think` | 3 s | ok | ok | Mao junto ao queixo. |
| `gesto:thumbdown` | 3 s | ok | ok | Polegar para baixo. |
| `gesto:thumbup` | 3 s | ok | ok | Polegar para cima. |
| `gesto:wave` | 3 s | ok | ok | Aceno com a mao no alto. |

### Gestos TalkingHead (outra mao)

| Movimento | Duracao | Eva | Neptuna | O que se ve |
| --- | --- | --- | --- | --- |
| `gesto:celebrate:espelhado` | 3 s | ok | ok | Os dois bracos para o alto. Com a outra mao. |
| `gesto:handup:espelhado` | 3 s | ok | ok | Levanta a mao, dedos abertos. Com a outra mao. |
| `gesto:index:espelhado` | 3 s | ok | ok | Indicador para cima. Com a outra mao. |
| `gesto:namaste:espelhado` | 3 s | ok | ok | Maos juntas na frente do peito, dedos juntos. Com a outra mao. |
| `gesto:ok:espelhado` | 3 s | ok | ok | Sinal de OK. Com a outra mao. |
| `gesto:open:espelhado` | 3 s | ok | ok | Os dois bracos abertos. Com a outra mao. |
| `gesto:point:espelhado` | 3 s | ok | ok | Aponta para a frente. Com a outra mao. |
| `gesto:shrug:espelhado` | 3 s | ok | ok | Ombros e maos abertas. Com a outra mao. |
| `gesto:side:espelhado` | 3 s | ok | ok | Mao aberta para o lado. Com a outra mao. |
| `gesto:think:espelhado` | 3 s | ok | ok | Mao junto ao queixo. Com a outra mao. |
| `gesto:thumbdown:espelhado` | 3 s | ok | ok | Polegar para baixo. Com a outra mao. |
| `gesto:thumbup:espelhado` | 3 s | ok | ok | Polegar para cima. Com a outra mao. |
| `gesto:wave:espelhado` | 3 s | ok | ok | Aceno com a mao no alto. Com a outra mao. |

### Poses TalkingHead

| Movimento | Duracao | Eva | Neptuna | O que se ve |
| --- | --- | --- | --- | --- |
| `pose:arms_open` | 3 s | ok | ok | Bracos abertos na horizontal. |
| `pose:back` | 3 s | ok | ok | De costas. |
| `pose:bend` | 3 s | ok | ok | Inclinada para a frente. |
| `pose:bow` | 3 s | ok | ok | Reverencia. |
| `pose:hip` | 3 s | ok | ok | Mao na cintura. |
| `pose:kneel` | 3 s | ok | ok | De joelhos. |
| `pose:oneknee` | 3 s | ok | ok | Um joelho no chao. |
| `pose:side` | 3 s | ok | ok | Peso em uma perna. |
| `pose:sitting` | 3 s | ok | ok | Sentada no chao. |
| `pose:straight` | 3 s | ok | ok | Em pe, reta. |
| `pose:thinking` | 3 s | ok | ok | Em pe, mao no queixo. |
| `pose:turn` | 3 s | ok | ok | Corpo de lado. |
| `pose:wide` | 3 s | ok | ok | Pernas abertas. |

## Observacoes honestas

- Os gestos de uma mao deixam o outro braco caido porque tocam sobre a animacao de espera. A pre-visualizacao deste teste usa a respiracao (`breathing-idle`) como espera, como o app.
- `hips.subir` e em centimetros absolutos. `sentada_chao` foi feita para a Eva (adulta). Em um modelo menor, ajuste o valor.
- Na Neptuna, olhei as folhas de contato de uma parte dos movimentos (FBX do app, poses e dois criados). Os outros so passaram na checagem automatica.
- A pose `arms_open` e os bracos abertos do TalkingHead ficam na horizontal. Isso e o desenho original deles.
