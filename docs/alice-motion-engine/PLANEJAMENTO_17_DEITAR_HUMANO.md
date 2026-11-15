# Planejamento 17 — Deitar como uma pessoa

**Data:** 15/11/2026. **Branch:** `claude/plano-17-controle-android-desktop`.
**Backup:** o FBX antigo ficou no histórico do git (`lie-down.fbx` e `get-up.fbx` antes do commit `8709cfdea`).

## 1. O que estava errado, medido quadro a quadro

Foram medidos os quadros do `lie-down.fbx` antigo, com a malha da Eva (menor altura da malha em relação ao chão):

| Tempo | Altura mais baixa da malha |
| --- | --- |
| 2 s | -0,51 m |
| 3 s | -0,58 m |
| 4 s | -0,72 m |
| 5 s | -0,08 m |

Ou seja: durante a entrada os pés e as pernas ficavam até **72 cm abaixo do chão**. Isso, mais o salto de pose em cada chave, dava o "robô com defeito".

**Causas encontradas no código (`packages/stage-ui-three/scripts/lie-down.py`):**

1. **Salto a cada chave.** A função `quaternion_curve` passava os quatro pontos da curva na ordem errada. No começo de cada trecho ela devolvia a pose da chave anterior, e o corpo saltava para trás a cada chave. Isso valia também para o `get-up.fbx`.
2. **Poses sem chão.** A altura do quadril e a direção das pernas foram escritas à mão, sem checar o chão. Os pés afundavam no agachamento, e no fim as duas pernas flutuavam a cerca de 30 cm.
3. **Sem apoio.** As mãos balançavam no ar. A pessoa nunca pousava a mão nem o joelho.
4. **Sem ritmo humano.** A descida era contínua, sem passo nem pausa, e acabava num tombo.

## 2. Como uma pessoa deita, e como ficou

Uma pessoa vai ao chão em fases, com apoio: olha o chão, dá um passo atrás, desce com uma mão no chão, apoia o joelho, ajoelha, senta de lado, apoia no antebraço e deita. Cada fase dura um segundo, e o corpo freia onde toca o chão.

O novo movimento (6,6 s) segue essa ordem:

| Tempo | Fase |
| --- | --- |
| 0,0 a 0,9 s | Em pé, olha para o chão. |
| 1,9 s | O pé direito dá um passo atrás, o corpo desce, a mão direita busca o chão. |
| 2,8 s | Meio ajoelhada: joelho direito e mão direita no chão. |
| 3,6 s | Os dois joelhos no chão. |
| 4,5 s | Senta sobre o quadril direito, pernas dobradas para a esquerda dela. |
| 5,5 s | Apoia no antebraço direito, pernas se esticam. |
| 6,6 s | Cabeça no braço. Respira. |

**Como o script garante o chão:**

- Um resolvedor de duas juntas (`Motion`, `two_bone`) fixa pés e mão em pontos do chão (`ik`). Um pé fixo não desliza.
- O quadril apoia no chão sozinho: a parte mais baixa do corpo toca o chão e nada afunda (`floor_clearance`).
- O quadril nunca desce mais rápido que 0,7 m/s (`MAX_DESCENT_CM_PER_SECOND`).
- O script mede o próprio resultado: `--analyze` e `--smooth`.

## 3. Resultado medido

| Medida | Antes | Depois |
| --- | --- | --- |
| Malha mais baixa durante a entrada | -0,72 m | -0,06 m (só no balanço do pé, 0,3 s) |
| Malha ao fim, deitada | -0,08 m | +0,007 m |
| Malha em pé | 0,001 m | 0,004 m |
| Velocidade máxima do quadril | 14 m/s (salto) | 0,71 m/s |
| Maior giro de um osso por quadro | 82 graus | 13 graus |

O teste `lie-down-motion.test.ts` agora falha se algum osso girar mais de 25 graus num quadro ou o quadril cair mais de 1,2 m/s. O FBX antigo falha nele (29 graus em 3,53 s).

Imagens: `evidencias/D17/deitar-antes-quadros.png`, `deitar-depois-quadros-1.png`, `deitar-depois-quadros-2.png`, `deitar-depois-frente.png` e `levantar-depois-quadros.png`.

O `get-up.fbx` foi gerado de novo com a mesma correção. O tempo de entrada no app passou de 5 s para 6,6 s (`loopFromSeconds` em `animations/index.ts`).

## 4. Flutuar e travar na janela do desktop

A janela do desktop mostra só a cabeça e o peito. O primeiro conserto subia o corpo para a janela, e o segundo o apoiava na borda de baixo. Os dois falharam, e a captura do app real mostrou por quê:

- A subida do corpo acontecia **ao mesmo tempo** que a descida. Na janela de busto, ela parecia parada por uns 5 s, "sustentada" no ar, e aparecia deitada de repente. Era o flutuar e o travado que você descreveu.
- A pré-visualização do navegador não mostrava isso, porque ali a câmera é fixa.

**Correção:** o corpo não sobe mais. Quando uma pose de arquivo segura o corpo no chão, a **câmera recua** (1,2 s) para o corpo inteiro, com o chão na borda de baixo da janela. Quando ela levanta, a câmera volta ao busto. O cálculo é a função pura `floorFraming` (`composables/vrm/floor-framing.ts`, com testes). `ThreeScene.vue` anima a câmera, e o `VRMModel.vue` avisa o palco com o evento `floorPose`. Só o desktop liga isso, com `vrm-frame-floor-pose`. Na web, no Android e no `/mirror`, nada muda.

Mais duas proteções no animador:

- **Pose repetida:** se a mesma pose (`key`) já segura o corpo, um segundo pedido não a reinicia. Antes, modo noite mais um comando de pose podiam reiniciar a entrada no meio.
- **Quadro atrasado:** um quadro que chega atrasado, por exemplo depois de carregar o FBX, move a animação no máximo 0,1 s. Antes, o movimento pulava um pedaço.

Prova: `evidencias/D17/desktop-sequencia-deitando.png`, 26 capturas da janela do app desktop compilado, uma a cada ~0,5 s, desde em pé até deitada.

## 5. O que este teste não prova

- O app instalado no seu computador. Recompile com `pnpm -F @proj-airi/stage-tamagotchi build`.
- A web e o Android: recompile o `airi-web` e o APK. A animação vem dos arquivos FBX do app.
- Num balanço de 0,3 s, a ponta da bota roça 5 cm abaixo do chão.
