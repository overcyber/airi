# Planejamento 10 — Pose deitada, expressões mais suaves e gestos da fala

> Data: 12/11/2026. Continua o Planejamento 09. Vale para o último VRM da Eva (`eva-ruiva.vrm`, convertido de `eva-new-ruiva.glb`) e para qualquer outro VRM, porque tudo passa pelo mesmo retarget das FBX.

## 1. O pedido

1. Uma animação FBX para a avatar ficar deitada. Hoje só há a pose `sitting` do TalkingHead e as poses de joelho.
2. Expressões menos exageradas.
3. Menos gesticulação na fala, sem repetir sempre os mesmos gestos.

## 2. O que mudou

| Item | Antes | Agora | Onde |
| --- | --- | --- | --- |
| Deitar | Não existia | `lie-down.fbx`: 2,5 s de pé até deitada do lado direito, cabeça no antebraço, e 6 s de respiração em laço. A pose fica pelo `duration` do comando, ou 10 s, e ela levanta tocando a entrada ao contrário. | `packages/stage-ui-three/src/assets/vrm/animations/neoalice/lie-down.fbx`, `scripts/lie-down.py`, `avatar-animator.ts` (`holdPoseClip`) |
| Comando da NeoAlice | — | `cmd/avatar/pose` com `lying` ou `lie_down`. Também `cmd/avatar/gesture` com `lie_down`, e o botão Play da lista de movimentos. | `packages/alice-motion/src/catalog.ts` (`pose_lying`, `pose_lie_down`) |
| Humor no rosto | `happy` 0,75, `sad` 0,8, `angry` 0,7 | `happy` 0,55, `sad` 0,55, `angry` 0,5, `surprised` 0,45. As formas ARKit do TalkingHead ficaram em cerca de 60%. | `mood-face.ts` |
| Reação (flash) | 1,4 × o humor, até 0,9 | 1,2 × o humor, até 0,65 | `mood-face.ts` |
| Rosto de emoji | Formas do TalkingHead em 1,0 | Cada forma para em 0,7 e vale 85% disso | `mood-face.ts` (`emojiShapeWeight`) |
| Rosto durante um gesto | Sorriso a 0,7 em todo gesto | Sorriso leve a 0,4 | `mood-face.ts` |
| Batidas da fala e do idle | Reação a 0,4 e 0,25 a cada poucos segundos | 0,2 e 0,12 | `VRMModel.vue` |
| Gesto pelo texto da fala | Toda fala com regra gesticulava. "Sim" acenava a cabeça sempre, "Olha" apontava sempre. | Saudação, despedida e agradecimento sempre tocam, com um gesto diferente do anterior. As outras regras tocam em 45% das falas e nunca antes de 14 s do último gesto. | `builtin-gestures.ts` (`SpeechGesturePicker`) |
| Clipe de fala (`Talking_0..2`) | Começava com a fala, sempre do início, a 0,5 | Começa 0,9 s depois da fala (uma resposta curta não mexe os braços), de um ponto aleatório, com peso de 0,3 a 0,45, e troca de clipe depois de 8 a 13 s numa fala longa. | `avatar-animator.ts` |

## 3. Como a FBX foi feita

O script `packages/stage-ui-three/scripts/lie-down.py` roda com o módulo Python do Blender (bpy 4.2):

```bash
python lie-down.py breathing-idle.fbx lie-down.fbx
```

Ele importa o esqueleto de uma FBX da NeoAlice, descarta a animação dela, escreve as poses como rotações de mundo sobre a tabela de repouso `rpmRestSkeleton` (a mesma que o retarget lê) e exporta. Com `--check-rest`, ele exporta só o repouso: a leitura em Node devolveu a tabela com erro máximo de 0,03 grau, então a convenção do arquivo está certa.

Poses-chave: de pé (0 s), agachada (0,9 s), sentada no chão sobre o quadril direito com as pernas para a esquerda (1,7 s), deitada (2,5 s). O laço respira com o peito (3 s por ciclo) e acomoda a cabeça e a perna de cima devagar (6 s).

## 4. Evidências

Capturas com o VRM de teste `neptuna` (VRM 0.x) no retarget real (`fbx-retarget.ts`), em `evidencias/D10/`:

- `sentada-de-lado-1.7s.png`: o meio da transição.
- `deitada-frente.png`: a pose final vista de frente, como no espelho.
- `deitada-cima.png`: a pose final vista de cima. O quadril ficou a 0,14 m e a cabeça a 0,22 m.
- `eva-sentada-de-lado-1.7s.png`, `eva-deitada-frente.png`, `eva-deitada-cabeca.png`, `eva-deitada-costas-tranca.png`: a Eva (`eva-ruiva.vrm`, VRM 1.0) com as molas do cabelo simuladas e o colisor de chão.

Teste automático: `packages/stage-ui-three/src/composables/vrm/lie-down-motion.test.ts` lê a FBX, passa pelo retarget e confere o repouso no começo, o quadril no chão, o corpo de lado com a frente para o espectador, e o laço sem salto.

## 4.1. Eva: cabelo e colisor de chao

As primeiras capturas (`deitada-*.png`) eram quadros parados, sem a simulacao das molas: a tranca aparecia reta, fora da fisica. Com a Eva e a simulacao a 60 fps (`eva-deitada-*.png`), a tranca cai com a gravidade atras da cabeca ate o chao. O VRM nao tinha colisor de chao, entao a ponta da tranca atravessava o piso (ponta a -0,03 m).

Correcao no modelo: o conversor (`packages/alice-avatar-tools`, `addFloorCollider`) acrescenta um colisor plano no no raiz, na altura dos pes, como `VRMC_springBone_extended_collider`. Com ele, a ponta fica a 0,02 m do chao (o `hitRadius` da junta). O `preparar.sh` ja usa o conversor, entao a proxima `eva-ruiva.vrm` sai com o colisor. Para um VRM ja convertido, rode o passo sozinho:

```bash
pnpm -F @proj-airi/alice-avatar-tools exec tsx -e "import{readFileSync,writeFileSync}from'node:fs';import{addFloorCollider,readGlb,writeGlb}from'./src/index';const g=readGlb(readFileSync('eva-ruiva.vrm'));console.log(addFloorCollider(g));writeFileSync('eva-ruiva.vrm',writeGlb(g))"
```

## 4.2. Sorriso dobrado e cabelo parado (13/11)

- **Sorriso de Coringa.** Na Eva, o humor `happy` escrevia o preset `happy` do modelo (que ja e `mouthSmile` 0,8) e, por cima, as formas ARKit `mouthSmile`. Os dois somados passavam de 1. Agora, num modelo com as formas ARKit, o AIRI escreve so as formas ARKit (humor, reacao e emoji). O preset do modelo tambem ficou mais leve (`happy` 0,5, `surprised` 0,6 a 0,7, `angry` 0,7), para qualquer outro visualizador.
- **Cabelo sem fisica.** A tranca tinha rigidez 1 na raiz e arrasto 0,35: ficava dura como um pau. Agora rigidez 0,55 na raiz ate 0,12 na ponta, gravidade 0,55 e arrasto 0,2. Se o cabelo nao mexe no espelho, o VRM que esta em `deploy/alice/modelos` e anterior as molas (Plano 08, M2). Troque pelo VRM atualizado.
- **Comando novo:** `pnpm -F @proj-airi/alice-avatar-tools convert retune eva-ruiva.vrm` aplica os tres ajustes num VRM ja convertido, sem converter de novo.

## 4.3. Olhos parados e sorriso somado (13/11, segunda correção)

Medido no `eva-ruiva.vrm` com o look-at real do three-vrm, não suposto:

| Problema | Causa medida | Correção |
| --- | --- | --- |
| Olhos estáticos | O look-at do modelo girava os olhos 10° para um alvo a 90° (padrão de modelo VRoid). Com o alvo a 46°, o olho girava 5°. Os olhos não seguravam o espectador quando a cabeça virava. | `lookAtSettings` no conversor: 30° de olho para 40° de alvo na horizontal, 18° para baixo e 14° para cima. O `convert retune` aplica num VRM já convertido. |
| Olhos estáticos | As sacadas ociosas (`useIdleEyeSaccades.update`) nunca eram chamadas: o `VRMModel.vue` chamava só `instantUpdate`, uma vez. E o desvio era de 25 cm num alvo a 100 m: 0,14°. | O laço de quadro chama `update` em todo quadro. O desvio agora é angular: até 4° para o lado e 2,5° para cima ou para baixo, a cada 0,8 a 4,4 s, em cerca de 50 ms. |
| Olhos estranhos ao piscar | A piscada escrevia o preset `blink` e as formas `eyeBlinkLeft` e `eyeBlinkRight`, que são a mesma coisa na Eva: pálpebra fechada em dobro. | `blinkExpressionsOf`: o preset, ou as duas formas, nunca os dois. |
| Olhar contra o look-at | Os rostos de emoji 😏 e 😒 escreviam formas `eyeLook*` por baixo do look-at. | O rosto de emoji não escreve mais `eyeLook*`. |
| Sorriso ainda largo | O humor feliz (formas ARKit), o rosto do emote (preset `happy`), o vínculo (preset `relaxed`) e um emoji de riso escreviam cada um um sorriso por uma expressão diferente, e o modelo somava todos. | Num modelo ARKit, todo sorriso passa pelas mesmas formas e vale o maior, nunca a soma. As formas que fazem a careta têm teto: `noseSneer` e `mouthUpperUp` 0,17, `eyeSquint` 0,3, `mouthSmile` 0,43. |

Hipótese descartada: "o alvo perto da câmera deixa os olhos vesgos". O three-vrm aplica o mesmo ângulo nos dois olhos (medido: quaternions iguais nos dois), então a distância do alvo não cruza os olhos. O `eye-tracking.ts` ficou como estava.

Evidências em `evidencias/D10/`: `eva-olhos-frente.png`, `eva-olhos-lado.png`, `eva-olhos-cima.png` (alvos a 46° e 44°) e `eva-riso-pior-caso.png` (humor feliz, vínculo no máximo e emoji 😄 juntos, pela classe `MoodFace` real).

A Neptuna (`packages/alice-motion/fixtures/vrm/neptuna/neptuna.vrm`) é o modelo de teste de outro autor, com licença própria: o arquivo não foi alterado. As correções de código acima valem para ela também, porque estão no AIRI e não no arquivo.

## 5. Teste no espelho

### 5.1 Confira a versão do servidor antes de testar

Se o servidor não está no branch, nada desta seção funciona. O `retune` também falha com `ENOENT: no such file or directory, open 'retune'`. Esse erro é do `cli.ts` antigo, que não conhece o comando `retune`.

Na pasta do repositório no servidor, rode:

```bash
git fetch origin claude/bold-einstein-8ye9r5
```

```bash
git checkout claude/bold-einstein-8ye9r5 && git pull --rebase origin claude/bold-einstein-8ye9r5
```

```bash
git log -1 --oneline
```

Esperado: o commit mais novo do branch, não o do `main`. Uma mensagem `Already up to date` em outro branch não atualiza nada.

Depois, na raiz do repositório, rode o `retune`. Um caminho relativo começa na pasta onde você digitou o comando:

```bash
pnpm -F @proj-airi/alice-avatar-tools convert retune deploy/alice/modelos/eva-ruiva.vrm
```

O teste `stage-motion.test.ts` cobre o caminho inteiro, do tópico `cmd/avatar/pose` com `lying` até o clipe `lie_down` com 20 s.

### 5.2 Teste do comando

O comando so funciona depois de atualizar o AIRI do servidor: `git pull` no branch, `docker compose -f deploy/alice/compose.yaml up -d --build`, e recarregar a pagina do espelho. A versao anterior do container nao conhece `lying`, e a ponte registra `ignored: the catalog has no action for this command`. Para conferir, abra o console da pagina `/mirror`: a linha `[neoalice-bridge] played pose_lying as clip lie_down` aparece quando o comando chega.

```bash
S=neoalice/v1/magicmirror
```

```bash
mosquitto_pub -h 192.0.2.10 -t "$S/cmd/avatar/pose" -m '{"pose":"lying","duration":20}'
```

Esperado: ela agacha, senta de lado e deita em 2,5 s, respira deitada por 20 s, e levanta pelo caminho contrário. `{"pose":"straight"}` levanta antes. `{"pose":"sitting"}` enquanto deitada troca para a pose sentada sem levantar.

Como a avatar deitada ocupa cerca de 1,6 m de largura, use a vista de corpo inteiro do `/mirror` (sem `view=bust`).

## 6. O que não mudou

- O lip sync e a NeoAlice (regra de bloqueio do `JUSTIFICATIVA_ALTERACOES_NEOALICE.md`).
- As expressões do modelo em si. A Eva continua com as 52 formas ARKit do conversor. Só os pesos que o AIRI escreve mudaram.
