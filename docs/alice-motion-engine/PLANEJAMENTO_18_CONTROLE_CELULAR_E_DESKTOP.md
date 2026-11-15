# Planejamento 18 — Controle do celular e do desktop

**Data:** 15/11/2026. **Branch:** `claude/plano-17-controle-android-desktop`.

## 1. O que existe

| App | Ler a tela | Controlar | Onde você liga |
| --- | --- | --- | --- |
| Android (pocket) | Árvore de views pelo Serviço de Acessibilidade: texto, botões, lugar | Tocar, segurar, deslizar, clicar numa view, digitar, rolar, Voltar, Início, Recentes, Notificações, abrir app | Configurações do app, Sistema, **Controle do celular**, e Acessibilidade do Android |
| Desktop (Tamagotchi) | Captura de tela e janelas (AUV) | Mouse e teclado (AUV), no Windows, Linux e macOS | Configurações do app, Sistema, **Controle do computador** |

Tudo começa **desligado**.

## 2. Camadas de segurança

1. **Chave geral.** Sem ela, nenhuma ferramenta lê nem controla. No desktop, o processo principal confere a chave em toda chamada (`computer_use`), não só a página. No Android, a ferramenta confere a chave a cada chamada.
2. **Chave dos comandos da NeoAlice (MQTT).** Separada, e só pode ficar ligada com a chave geral ligada. O broker MQTT não tem senha. Qualquer aparelho da rede que o alcance pode mandar comandos. Ligue só numa rede de confiança.
3. **Confirmação.** Com "Perguntar antes de cada comando" (ligado por padrão), cada comando da NeoAlice abre uma janela "permitir?" no aparelho.
4. **Limite.** No máximo 20 comandos da NeoAlice por minuto.
5. **Lista de ações.** O Android mostra as últimas 30 ações na página de configurações, e o desktop escreve no console (`[computer-control]`).
6. **Senhas.** No Android, o texto de um campo de senha nunca sai do serviço, e o app recusa digitar num campo de senha.
7. **Ação validada.** O Valibot confere cada ação (`android-actions.ts`), e o Kotlin confere de novo. Coordenadas fora da tela, tecla desconhecida e nome de pacote inválido são recusados.
8. **Serviço do Android.** O serviço não escuta eventos. Ele lê a tela só quando uma ferramenta pede. Quem desliga o serviço em Acessibilidade para tudo.

## 3. Como ligar

**Desktop:** Configurações, Sistema, Controle do computador. Ligue "Permitir que a AIRI controle este computador". No macOS, permita também Acessibilidade e Gravação de Tela em Privacidade e Segurança.

**Android:**
1. Configurações do app, Sistema, **Controle do celular**, botão "Abrir configurações de acessibilidade".
2. Em Acessibilidade do Android, ligue o serviço **AIRI**. O Android mostra o aviso padrão. Leia e confirme.
3. Volte ao app e ligue "Permitir que a AIRI controle este celular".

## 4. Como a NeoAlice usa

`cmd/avatar/tool` com `tool` e `args`. A resposta volta em `evt/avatar/tool_result`. As ferramentas:

- `android_screen_read`: lê a tela.
- `android_screen_act`: uma ação (`{"type":"key","key":"back"}`, `{"type":"tap","x":540,"y":1200}`, `{"type":"click_node","id":7}`, `{"type":"set_text","id":3,"text":"oi"}`, `{"type":"scroll","id":4,"direction":"forward"}`, `{"type":"open_app","packageName":"com.android.settings"}`).
- `computer_use` e `computer_use_read_image`: desktop.

Os comandos de teste estão em `movimentos/LISTA_COMANDOS.md`, na seção "Controle do celular e do desktop".

## 5. Código

- `packages/stage-ui/src/libs/device-control/`: `policy.ts` (quem pode), `android-actions.ts` (ações), `android-control-tools.ts` (ferramentas do LLM), `remote-gate.ts` (porta do MQTT), `confirm.ts`. Testes em `device-control.test.ts`.
- `packages/stage-ui/src/stores/device-control.ts`: as chaves e a lista de ações. Teste em `device-control.browser.test.ts`.
- `packages/alice-motion` e `use-neoalice-stage-bridge.ts`: `runNeoAliceTool` aceita uma `DeviceToolGate`. Sem ela, a lista antiga de ferramentas permitidas não muda.
- Android: `AiriAccessibilityService.kt`, `DeviceControlPlugin.kt`, `res/xml/airi_accessibility_service.xml`, `AndroidManifest.xml`.
- Android, TypeScript: `apps/stage-pocket/src/modules/device-control.ts`, `composables/use-android-device-control.ts`, `pages/settings/system/device-control.vue`.
- Desktop: `main/services/airi/computer-use/permission.ts`, `main/configs/computer-use-permission.ts`, `renderer/pages/settings/system/computer-control.vue`.

## 6. O que foi verificado e o que não foi

**Verificado aqui:** os testes de política, ações, ferramentas, porta do MQTT, store (no navegador) e permissão do desktop. O typecheck do `stage-ui`, do `stage-pocket` e do `stage-tamagotchi`. O XML do manifesto.

**Não verificado:**

- **O Kotlin não foi compilado.** Este ambiente não tem o SDK do Android nem o Gradle. O código foi escrito com cuidado, mas pode ter um erro de compilação. Compile com `deploy/alice/scripts/android-apk.sh` e me mande o erro, se houver.
- **Nada rodou num aparelho.** O serviço de acessibilidade, os toques e a digitação precisam de um celular.
- **A janela "permitir?" do MQTT** usa o `confirm` do navegador. Não testei na tela.
- **O microfone e o chat de texto do Android** usam o mesmo código da web (`MobileInteractiveArea`). Revisei o código e não achei falha, mas não testei no celular. Para o chat e o áudio funcionarem, o app precisa do endereço do servidor (Planejamento 13). O microfone pede a permissão `RECORD_AUDIO`, que o manifesto já declara.
- **Abrir app:** o Android 10 ou mais novo pode recusar abrir um app a partir de um serviço em segundo plano. A ação então responde com o erro.
