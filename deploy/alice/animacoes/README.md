# Movimentos do servidor

Coloque aqui os arquivos `.fbx` (Mixamo, Ready Player Me) e `.vrma` que o avatar deve conhecer.

- O `airi-web` serve esta pasta em `/animations/`. O AIRI põe cada arquivo na biblioteca de movimentos, sem importar à mão. O nome do arquivo vira o nome do movimento, por exemplo `Wave_Hello.fbx` vira "Wave Hello".
- A NeoAlice pode pedir um movimento pelo nome em `cmd/avatar/animation`.
- O `scripts/preparar.sh` copia as três pastas de movimentos do TalkingHead (`../talkinghead-neoalice`), com os mesmos caminhos do servidor dele:
  - `animations/*` vai para esta pasta e é servido em `/animations/`;
  - `animations_arkit/*` vai para `animations_arkit/` e é servido em `/animations_arkit/`;
  - `poses/*` vai para `poses/` e é servido em `/poses/`.
- Assim, um `cmd/avatar/animation` com a URL do servidor do espelho (por exemplo `http://<ip>:8081/poses/dance.fbx`) carrega do `airi-web`, no mesmo caminho.
- Um arquivo que já existe aqui não é substituído. Com outra pasta do TalkingHead: `TALKINGHEAD_DIR=/caminho deploy/alice/scripts/preparar.sh`.
- O Git ignora os arquivos desta pasta. O repositório `airi` é público, e os FBX do Mixamo não podem ser redistribuídos.
- Um arquivo novo aparece depois de recarregar a página.
