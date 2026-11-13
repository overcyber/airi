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

## 5. Teste no espelho

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
