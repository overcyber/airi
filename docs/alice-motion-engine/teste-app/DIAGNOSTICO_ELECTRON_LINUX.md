# AIRI Tamagotchi no Linux: Electron SUID sandbox e preload

## Sintoma observado em 05/11/2026

```text
electron main process built successfully
electron preload scripts built successfully
starting electron app...
FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:166
The SUID sandbox helper binary was found, but is not configured correctly
...chrome-sandbox is owned by root and has mode 4755
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
```

**O build está concluído.** O erro fatal ocorre ao iniciar Chromium/Electron, devido ao helper SUID. O erro pnpm é uma consequência do processo que saiu com código 1.

Outro aviso independente indica `preload entry ... requires chunks/shared-*.cjs`. Isso foi corrigido nesta branch em `apps/stage-tamagotchi/electron.vite.config.ts`, definindo `preload.build.isolatedEntries: true` e `preload.build.externalizeDeps: false`.

## Diagnóstico no host, sem desabilitar o sandbox

```bash
cd /mnt/dockers/airi

SANDBOX="$(find node_modules/.pnpm -path '*/node_modules/electron/dist/chrome-sandbox' -type f -print -quit)"
test -n "$SANDBOX" && test -f "$SANDBOX" || { echo "chrome-sandbox não encontrado"; exit 1; }
SANDBOX="$(readlink -f "$SANDBOX")"

stat -c '%U:%G %a %n' "$SANDBOX"
findmnt -T "$SANDBOX" -o TARGET,FSTYPE,OPTIONS

# Somente se a montagem NÃO contiver nosuid:
sudo chown root:root "$SANDBOX"
sudo chmod 4755 "$SANDBOX"
stat -c '%U:%G %a %n' "$SANDBOX"

pnpm dev:tamagotchi
```

Esperado: `root:root 4755`. A propriedade pode ser perdida depois de reinstalar o Electron; revalidar após `pnpm install`.

### Se /mnt/dockers estiver montado com nosuid

`chmod 4755` nessa montagem não ativa SUID. Não remonte a partição com `suid` sem avaliar o impacto. Para desenvolvimento, o Chromium documenta a variável `CHROME_DEVEL_SANDBOX` para apontar a uma cópia com proprietário root e modo 4755 instalada numa montagem apropriada. Confirmar também a aceitação pela versão do Electron em uso:

```bash
sudo install -d -o root -g root -m 0755 /usr/local/lib/airi
sudo install -o root -g root -m 4755 "$SANDBOX" /usr/local/lib/airi/chrome-sandbox
stat -c '%U:%G %a %n' /usr/local/lib/airi/chrome-sandbox
findmnt -T /usr/local/lib/airi/chrome-sandbox -o TARGET,FSTYPE,OPTIONS

CHROME_DEVEL_SANDBOX=/usr/local/lib/airi/chrome-sandbox pnpm dev:tamagotchi
```

**Não usar `sudo pnpm dev:tamagotchi`**; o processo Electron deve permanecer como usuário normal. **Não tornar `--no-sandbox` solução permanente.** Configuração de namespaces e políticas AppArmor depende do host; não enfraquecer o sistema globalmente para contornar essa falha.

## Verificação do preload

`apps/stage-tamagotchi/electron.vite.config.ts` agora inclui:

```ts
preload: {
  build: {
    isolatedEntries: true,
    externalizeDeps: false,
    lib: { /* index e beat-sync */ },
  },
}
```

Critérios a verificar no próximo build:

1. Não aparecer aviso `preload entry ... requires chunks/shared-*.cjs`.
2. Cada entrada de preload contém suas dependências e não requer o arquivo `shared-*.cjs`.
3. Electron inicia sem FATAL SUID, com `contextIsolation` e sandbox preservados.
4. Abrir o app e testar chat, avatar, acesso à interface e IPC de preload.
5. Registrar `findmnt`, `stat` e log de boot sem segredos.

## Fontes

- Chromium: https://chromium.googlesource.com/chromium/src/+/1c2b5b25c398cc2223a602fe5bcccd80767a4059/docs/linux/suid_sandbox_development.md
- electron-vite: https://electron-vite.org/guide/isolated-build
- electron-vite troubleshooting: https://electron-vite.org/guide/troubleshooting
- Electron sandbox: https://www.electronjs.org/docs/latest/tutorial/sandbox

**Status:** configuração de preload alterada em branch separada; correção SUID depende de comando autorizado no Linux do usuário. Não há evidência de execução validada no host.
