# Modelos do servidor

Coloque aqui os arquivos `.vrm` que o AIRI deve mostrar em qualquer navegador, por exemplo `eva2.vrm`.

- O `airi-web` serve esta pasta em `/models/`. O AIRI lista cada `.vrm` no seletor de modelos, sem importar à mão.
- Um arquivo novo aparece depois de recarregar a página. Não é preciso reiniciar o contêiner.
- O Git ignora os arquivos desta pasta. O avatar convertido do Ready Player Me não pode ir para um repositório público.

O `scripts/preparar.sh` gera a `eva2.vrm` sozinho quando esta pasta não tem nenhum `.vrm`. Para gerar à mão, a partir do GLB do TalkingHead:

```bash
pnpm -F @proj-airi/alice-avatar-tools convert /caminho/para/avatars/eva2.glb deploy/alice/modelos/eva2.vrm Eva Alice
```
