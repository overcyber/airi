# Planejamento 12 — Poses corrigidas, deitar humano com bocejo, e poses criadas pelo LLM

**Data:** 14/11/2026
**Branch:** `claude/plano-12-poses-dinamicas`, criado a partir da `main` (`b55e010`, que já tem o Plano 11).
**Backup:** o arquivo `airi-backup-antes-plano-12.bundle`, entregue ao responsável antes de qualquer mudança.
**Decisão de arquitetura:** `docs/ai/adr/2026-11-14-llm-created-avatar-motions.md`.

## 1. Por que o `git pull --rebase` falhava no servidor

O git recusa `pull --rebase` quando a pasta tem mudanças locais. No servidor, o `pnpm install` que roda junto do `pnpm -F ... convert` muda o `pnpm-lock.yaml`.

Para voltar à `main` sem perder nada, rode na pasta do repositório:

```bash
git stash push -m "backup-servidor"
```

```bash
git fetch origin main && git checkout main && git pull --ff-only origin main
```

O `git stash list` mostra o backup local. Arquivos ignorados, como `.env` e `modelos/*.vrm`, não são tocados.

## 2. Poses que não funcionavam: causas medidas e correções

| Problema | Causa | Correção |
| --- | --- | --- |
| Uma pose com `duration` travava as outras, inclusive `straight` | O agendador segurava os canais do corpo pelo tempo inteiro da pose e recusava outra pose de mesma prioridade | A pose segura os canais só durante a entrada. O tempo vai ao renderizador, e uma pose nova troca a anterior |
| Comandos sumiam depois de uma reconexão MQTT | O número do comando recomeçava em 1, e o palco recusava números já vistos por 10 min | Cada conexão tem uma marca própria no número |
| `{"pose":"lying"}` deitava e levantava sozinha | Um gesto de pé (da fala ou de um emoji) desfazia a pose de chão | Enquanto ela está no chão, gestos de pé são ignorados. Uma pose nova ainda funciona |
| `lying` no modo noite fazia levantar e deitar de novo | O modo noite acabava antes de a pose começar | `lying` no modo noite é ignorado, porque ela já está deitada |
| Namaste com os dedos para fora | A tabela de repouso dos ossos era de outro avatar, com os dedos curvados. Na Eva, os dedos retos dobravam para trás | O renderizador usa o repouso dos ossos da própria Eva |
| `{"pose":"namaste"}` não fazia nada | Namaste é um gesto, não uma pose | Um gesto mandado como pose toca como gesto, por 10 s ou pelo `duration` |
| `point` levantava a mão perto da cabeça | O braço do `point` era uma cópia do braço do `wave` | Braço do `custom_moves.json` da Eva, com os dedos apontando |
| `think` e `open` sem dedos | O porte não tinha os ossos dos dedos | Templates completos do `custom_moves.json` da Eva |

As 10 poses e os 8 gestos que vêm do TalkingHead original (MIT) foram conferidos valor por valor: são idênticos.

## 3. Deitar, levantar e bocejo

- **Deitar** (`lie-down.fbx`, 5 s):
  - Ela olha para o chão e dobra os joelhos.
  - Põe a mão direita no chão, senta no quadril direito e deita.
  - A cabeça vai na frente e o quadril vem com atraso. As poses-chave se juntam sem parar.
  - Deitada, a respiração tem cerca de 13 ciclos por minuto, com a inspiração mais curta.
- **Levantar** (`get-up.fbx`, 5,2 s): o braço empurra, ela senta, fica de joelhos e levanta, com a cabeça por último. Antes, levantar era o deitar tocado ao contrário.
- **No chão:** a respiração e a inclinação de pé, a varredura da cabeça e o atraso do tronco ficam desligados.
- **Bocejo:**
  - Boca bem aberta, olhos apertados, cabeça para trás e ombros subindo, em 3,6 s.
  - Toca:
    - no começo do modo noite;
    - de vez em quando com o humor sonolento;
    - com `{"gesture":"yawn"}`;
    - com o emoji 🥱.
- **Script:** os dois arquivos saem de `packages/stage-ui-three/scripts/lie-down.py` (o levantar com `--get-up`).

## 4. Banco de ossos e "músculos" da Eva

`packages/alice-motion/src/avatar-rig.ts` tem 52 ossos (todos os humanoides menos os olhos) e as formas do rosto ARKit.

| Osso (exemplo) | Eixos, em graus |
| --- | --- |
| `hips` | `frente`, `lado`, `girar`, e `subir` em centímetros (-90 senta no chão) |
| `spine`, `chest`, `upperChest`, `neck`, `head` | `frente`, `lado`, `girar` |
| `leftShoulder`, `rightShoulder` | `levantar`, `frente` |
| `leftUpperArm`, `rightUpperArm` | `levantar` (0 junto ao corpo, 90 na horizontal, 180 para cima), `frente` (0 para o lado, 90 para a frente), `torcer` |
| `leftLowerArm`, `rightLowerArm` | `dobrar`, `torcer` |
| `leftHand`, `rightHand` | `dobrar`, `desviar` |
| dedos (`leftIndexProximal` e outros) | `fechar` (90 é um punho), `abrir` |
| `leftUpperLeg`, `rightUpperLeg` | `frente`, `lado`, `girar` |
| `leftLowerLeg`, `rightLowerLeg` | `dobrar` |
| `leftFoot`, `rightFoot` | `apontar`, `girar` |

Todo eixo em 0 é a pose em pé, com os braços para baixo. Cada eixo tem um limite humano: um valor fora do limite é cortado.

O banco completo, com descrições e limites, está em três lugares:

- no tópico retido `neoalice/v1/companion/evt/avatar/rig`;
- na ferramenta `avatar_rig`;
- no botão "Baixar banco de ossos e rosto" da página `/movimentos`.

## 5. Como a NeoAlice cria um movimento

### 5.1 Formato de ossos (novo)

```bash
mosquitto_pub -h 192.0.2.10 -t "neoalice/v1/magicmirror/cmd/avatar/motion" -m '{"name":"vitoria","kind":"gesture","duration":3,"save":true,"keyframes":[{"t":0,"bones":{"rightUpperArm":{"levantar":90}}},{"t":0.8,"bones":{"rightUpperArm":{"levantar":170},"rightLowerArm":{"dobrar":10}},"face":{"mouthSmileLeft":0.5,"mouthSmileRight":0.5}}]}'
```

- `kind`: `pose` segura o corpo por `duration` segundos. `gesture` mexe só os ossos do movimento.
- `keyframes`: tempo em segundos, ossos e rosto. Uma pose simples pode usar `bones` e `face` direto, sem `keyframes`.
- `mirror: true` toca com o outro lado do corpo.
- `save: true` com `name` salva o movimento. Depois, `{"gesture":"vitoria"}` toca de novo.

### 5.2 Formato TalkingHead (o mesmo do espelho antigo)

```bash
mosquitto_pub -h 192.0.2.10 -t "neoalice/v1/magicmirror/cmd/avatar" -m '{"action":"defineGesture","name":"saudacao","template":{"LeftArm.rotation":{"x":-0.74,"y":0.40,"z":0.27},"LeftForeArm.rotation":{"x":-0.93,"y":0.35,"z":-0.24}}}'
```

```bash
mosquitto_pub -h 192.0.2.10 -t "neoalice/v1/magicmirror/cmd/avatar" -m '{"action":"gesture","name":"saudacao","mirror":true}'
```

- **Ações aceitas em `cmd/avatar`:** `gesture`, `pose`, `animation`, `mood`, `face`, `stop`, `defineGesture` e `definePose`. `look` é ignorado: o olhar vem do modo de rastreio.
- **Definições:** `defineGesture` e `definePose` são salvos e valem também depois de recarregar a página.

### 5.3 Pelas ferramentas de LLM

- `avatar_rig` devolve o banco.
- `avatar_motion` recebe o mesmo JSON do item 5.1 e devolve o que foi cortado.
- A NeoAlice pode chamar as duas com `cmd/avatar/tool`, e o LLM do AIRI também pode usá-las.

### 5.4 Prompt pronto para o LLM da NeoAlice

> Você controla o corpo 3D da Alice. Para um movimento novo, mande em `cmd/avatar/motion` um JSON com `name`, `kind` (`pose` ou `gesture`), `duration` em segundos e `keyframes` (`t` em segundos, `bones` com eixos em graus, `face` com formas de 0 a 1). Use só os ossos e eixos do banco `evt/avatar/rig`. Todo eixo em 0 é a pose em pé, com os braços para baixo. Para guardar o movimento, inclua `"save": true`. Para repetir um movimento salvo, mande `{"gesture": "<nome>"}` ou `{"pose": "<nome>"}`.

## 6. Onde ficam os movimentos salvos

- **Arquivo:** o serviço `alice-companion` grava `movimentos.json` na pasta de dados (`/data` do container), com escrita atômica. Para ver o arquivo:

```bash
docker compose -f deploy/alice/compose.yaml exec alice-companion cat /data/movimentos.json
```

- **Tópico:** a biblioteca vai retida para `neoalice/v1/companion/evt/avatar/motions`.
- **Apagar um movimento:**

```bash
mosquitto_pub -h 192.0.2.10 -t "neoalice/v1/magicmirror/cmd/avatar/motion_delete" -m '{"name":"vitoria"}'
```

- **Página `/movimentos` do AIRI** (por exemplo `https://<servidor>:4443/movimentos`): lista todos os movimentos, antigos e novos. Para cada um, mostra a origem, a descrição, o comando `mosquitto_pub` pronto, um botão para tocar no espelho e um botão para copiar o comando. Ela usa o broker configurado na ponte NeoAlice.

## 7. Verificação

| Comando | Resultado |
| --- | --- |
| `pnpm -F @proj-airi/alice-motion exec vitest run` | 113 testes passam |
| `pnpm -F @proj-airi/stage-ui-three exec vitest run` | 142 testes passam |
| `pnpm -F @proj-airi/alice-companion exec vitest run` | 55 testes passam |
| `pnpm -F @proj-airi/stage-ui exec vitest run --project node` | 1 falha em 1413 (`chat.contract.test.ts`), a mesma da `main` sem estas mudanças |
| `vue-tsc --noEmit` em `stage-ui-three`, `stage-ui` e `stage-web`, e `tsc` em `alice-motion` e `alice-companion` | Sem erros |

**Não testado:** a página `/movimentos` num navegador ligado a um broker real, e as ferramentas de LLM com um modelo real.
