# Movimentos do servidor

Coloque aqui os arquivos `.fbx` (Mixamo, Ready Player Me) e `.vrma` que o avatar deve conhecer.

- O `airi-web` serve esta pasta em `/animations/`. O AIRI põe cada arquivo na biblioteca de movimentos, sem importar à mão. O nome do arquivo vira o nome do movimento, por exemplo `Wave_Hello.fbx` vira "Wave Hello".
- A NeoAlice pode pedir um movimento pelo nome em `cmd/avatar/animation`.
- O `scripts/preparar.sh` copia os FBX de `../talkinghead-neoalice/animations` quando esta pasta está vazia. Com outra pasta: `ANIMATIONS_DIR=/caminho deploy/alice/scripts/preparar.sh`.
- O Git ignora os arquivos desta pasta. O repositório `airi` é público, e os FBX do Mixamo não podem ser redistribuídos.
- Um arquivo novo aparece depois de recarregar a página.
