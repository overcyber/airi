# Prompt para criar novos movimentos

Cole o texto da seção "Prompt" em qualquer LLM. Peça o movimento em português. A LLM devolve um JSON. Você manda o JSON para o avatar.

## Como enviar o que a LLM criou

Para tocar sem salvar:

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/motion' -m '<JSON em uma linha>'
```

Para salvar pelo nome, ponha `"save": true` e `"name"` no JSON. O serviço `alice-companion` guarda o movimento em `movimentos.json`. Depois:

```bash
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/pose' -m '{"pose":"nome_do_movimento"}'
mosquitto_pub -h $BROKER -p 1883 -t 'neoalice/v1/magicmirror/cmd/avatar/gesture' -m '{"gesture":"nome_do_movimento"}'
```

A página `/movimentos` do app web lista todos os movimentos salvos.

O avatar também tem as ferramentas `avatar_rig` (lê os ossos) e `avatar_motion` (cria, toca e salva). O LLM do AIRI usa essas duas, sem copiar nada.

## Prompt

````text
Você cria poses e movimentos para o avatar 3D Alice (Eva). Responda só com um objeto JSON, sem texto em volta.

FORMATO "bones" (padrão):
{"name":"snake_case","description":"uma frase","kind":"pose"|"gesture","format":"bones","duration":segundos,
 "keyframes":[{"t":segundos,"bones":{"osso":{"eixo":graus}},"face":{"forma":0 a 1}}]}
Para uma pose parada, use "bones" e "face" direto, sem "keyframes".

REGRAS
- "pose" segura o corpo por "duration" segundos e depois o avatar volta ao normal. Cite os dois braços, ou o que não citar fica caído junto ao corpo.
- "gesture" mexe só nos ossos que você citar, em cima da animação de espera. Cite só o que se mexe.
- Todos os eixos em 0 é a pose de pé, braços caídos. O que você não citar em um quadro mantém o valor do quadro anterior.
- Tempos "t" em ordem crescente, dentro de "duration" (0,5 a 60). No máximo 64 quadros.
- Valores fora do limite são cortados. Ossos, eixos e formas que não existem são ignorados.
- Faça um movimento natural: comece e termine perto da pose de repouso, use poucos ossos, e mova a cabeça e o tronco um pouco junto dos braços.
- "mirror": true toca com o outro lado do corpo.
- Direita e esquerda são DELA, não de quem olha.

OSSOS E EIXOS (graus, com limites):
- hips: quadril, a raiz do corpo. Eixos: frente -45 a 90; lado -45 a 45; girar -90 a 90; subir -95 a 20.
- leftUpperLeg / rightUpperLeg: coxa (quadril). Eixos: frente -30 a 120; lado -20 a 60; girar -40 a 40.
- spine: coluna baixa. Eixos: frente -20 a 40; lado -25 a 25; girar -30 a 30.
- leftLowerLeg / rightLowerLeg: canela (joelho). Eixos: dobrar 0 a 150.
- chest: tórax. Eixos: frente -15 a 30; lado -20 a 20; girar -30 a 30.
- leftFoot / rightFoot: pé (tornozelo). Eixos: apontar -20 a 45; girar -30 a 30.
- upperChest: peito. Eixos: frente -10 a 20; lado -15 a 15; girar -20 a 20.
- leftShoulder / rightShoulder: ombro (clavícula). Eixos: levantar -10 a 30; frente -15 a 25.
- leftToes / rightToes: dedos do pé. Eixos: dobrar -30 a 40.
- neck: pescoço. Eixos: frente -20 a 40; lado -30 a 30; girar -50 a 50.
- head: cabeça. Eixos: frente -20 a 40; lado -35 a 35; girar -70 a 70.
- leftUpperArm / rightUpperArm: braço. Eixos: levantar 0 a 180; frente -30 a 135; torcer -90 a 90.
- leftLowerArm / rightLowerArm: antebraço (cotovelo). Eixos: dobrar 0 a 150; torcer -80 a 80.
- leftHand / rightHand: mão (pulso). Eixos: dobrar -70 a 80; desviar -25 a 35.
- Dedos: leftHandIndexProximal, leftHandIndexIntermediate, leftHandIndexDistal e o mesmo para Middle, Ring, Little. Eixo "fechar" 0 a 90 (90 é punho). Polegar: leftHandThumbMetacarpal, leftHandThumbProximal, leftHandThumbDistal, eixos "fechar" e "abrir". Troque left por right para a mão direita.

O eixo "levantar" do braço é o ângulo a partir de baixo: 0 junto ao corpo, 90 na horizontal, 180 para cima. O eixo "frente" do braço é a direção: 0 para o lado, 90 para a frente. O eixo "dobrar" do cotovelo e do joelho dobra a articulação. "hips" tem o eixo "subir" em centímetros (negativo desce, -90 senta no chão).

FORMA DO ROSTO (valores de 0 a 1):
browDownLeft (abaixa a sobrancelha esquerda), browDownRight (abaixa a sobrancelha direita), browInnerUp (levanta o meio das sobrancelhas (preocupação, tristeza)), browOuterUpLeft (levanta a ponta da sobrancelha esquerda), browOuterUpRight (levanta a ponta da sobrancelha direita), cheekPuff (enche as bochechas de ar), cheekSquintLeft (sobe a bochecha esquerda (sorriso verdadeiro)), cheekSquintRight (sobe a bochecha direita), eyeBlinkLeft (fecha o olho esquerdo), eyeBlinkRight (fecha o olho direito), eyeSquintLeft (aperta o olho esquerdo), eyeSquintRight (aperta o olho direito), eyeWideLeft (arregala o olho esquerdo), eyeWideRight (arregala o olho direito), jawForward (leva o queixo para a frente), jawLeft (leva o queixo para a esquerda), jawOpen (abre a boca pela mandíbula), jawRight (leva o queixo para a direita), mouthClose (fecha os lábios com a boca aberta), mouthDimpleLeft (covinha à esquerda), mouthDimpleRight (covinha à direita), mouthFrownLeft (canto esquerdo da boca para baixo), mouthFrownRight (canto direito da boca para baixo), mouthFunnel (boca em funil (som de "ó")), mouthLeft (boca para a esquerda), mouthLowerDownLeft (abaixa o lábio de baixo à esquerda), mouthLowerDownRight (abaixa o lábio de baixo à direita), mouthPressLeft (aperta os lábios à esquerda), mouthPressRight (aperta os lábios à direita), mouthPucker (bico (beijo)), mouthRight (boca para a direita), mouthRollLower (enrola o lábio de baixo para dentro), mouthRollUpper (enrola o lábio de cima para dentro), mouthShrugLower (sobe o lábio de baixo), mouthShrugUpper (sobe o lábio de cima), mouthSmileLeft (sorriso, canto esquerdo), mouthSmileRight (sorriso, canto direito), mouthStretchLeft (estica a boca para a esquerda), mouthStretchRight (estica a boca para a direita), mouthUpperUpLeft (sobe o lábio de cima à esquerda), mouthUpperUpRight (sobe o lábio de cima à direita), noseSneerLeft (franze o nariz à esquerda), noseSneerRight (franze o nariz à direita), tongueOut (mostra a língua)

FORMATO "talkinghead" (opcional, o do espelho antigo): {"name":"...","kind":"gesture","format":"talkinghead","duration":3,"props":{"LeftArm.rotation":{"x":[1.5,1.7],"y":0,"z":1}}}. Rotações em radianos nos ossos Ready Player Me (LeftShoulder, LeftArm, LeftForeArm, LeftHand, Head, Spine, Hips.position em metros). Um par [min,max] sorteia um valor a cada vez.

Quando eu pedir um movimento, devolva o JSON do formato "bones", a não ser que eu peça "talkinghead".
````

## Exemplos criados e testados

Cada exemplo abaixo foi tocado na Eva (4 quadros no relatório de testes) e passa na checagem sem nenhum valor cortado.

### aceno_largo

Aceno grande com a mao direita, sorrindo. Tipo: gesture, formato: bones, 3.0 s.

```json
{
  "name": "aceno_largo",
  "description": "Aceno grande com a mao direita, sorrindo",
  "kind": "gesture",
  "format": "bones",
  "duration": 3.0,
  "keyframes": [
    {
      "t": 0,
      "bones": {
        "rightUpperArm": {
          "levantar": 10
        }
      },
      "face": {
        "mouthSmileLeft": 0.2,
        "mouthSmileRight": 0.2
      }
    },
    {
      "t": 0.6,
      "bones": {
        "rightUpperArm": {
          "levantar": 150,
          "frente": 20
        },
        "rightLowerArm": {
          "dobrar": 30
        },
        "head": {
          "lado": 8
        }
      },
      "face": {
        "mouthSmileLeft": 0.45,
        "mouthSmileRight": 0.45
      }
    },
    {
      "t": 1.0,
      "bones": {
        "rightUpperArm": {
          "levantar": 150,
          "frente": 20
        },
        "rightLowerArm": {
          "dobrar": 60
        },
        "rightHand": {
          "desviar": 20
        }
      }
    },
    {
      "t": 1.4,
      "bones": {
        "rightUpperArm": {
          "levantar": 150,
          "frente": 20
        },
        "rightLowerArm": {
          "dobrar": 20
        },
        "rightHand": {
          "desviar": -10
        }
      }
    },
    {
      "t": 1.8,
      "bones": {
        "rightUpperArm": {
          "levantar": 150,
          "frente": 20
        },
        "rightLowerArm": {
          "dobrar": 60
        },
        "rightHand": {
          "desviar": 20
        }
      }
    },
    {
      "t": 3.0,
      "bones": {
        "rightUpperArm": {
          "levantar": 10
        }
      }
    }
  ]
}
```

### abraco_aberto

Abre os bracos para a frente como quem oferece um abraco. Tipo: pose, formato: bones, 4.0 s.

```json
{
  "name": "abraco_aberto",
  "description": "Abre os bracos para a frente como quem oferece um abraco",
  "kind": "pose",
  "format": "bones",
  "duration": 4.0,
  "bones": {
    "leftUpperArm": {
      "levantar": 80,
      "frente": 50
    },
    "rightUpperArm": {
      "levantar": 80,
      "frente": 50
    },
    "leftLowerArm": {
      "dobrar": 25
    },
    "rightLowerArm": {
      "dobrar": 25
    },
    "head": {
      "lado": 6
    },
    "chest": {
      "frente": 6
    }
  },
  "face": {
    "mouthSmileLeft": 0.5,
    "mouthSmileRight": 0.5,
    "eyeSquintLeft": 0.2,
    "eyeSquintRight": 0.2
  }
}
```

### pensando_queixo

Mao direita no queixo, cabeca inclinada. Tipo: pose, formato: bones, 5.0 s.

```json
{
  "name": "pensando_queixo",
  "description": "Mao direita no queixo, cabeca inclinada",
  "kind": "pose",
  "format": "bones",
  "duration": 5.0,
  "bones": {
    "rightUpperArm": {
      "levantar": 45,
      "frente": 95
    },
    "rightLowerArm": {
      "dobrar": 130
    },
    "rightHand": {
      "dobrar": -10
    },
    "head": {
      "lado": -10,
      "frente": 6,
      "girar": -8
    },
    "spine": {
      "lado": 3
    }
  },
  "face": {
    "browInnerUp": 0.3,
    "mouthPressLeft": 0.2
  }
}
```

### aplauso

Bate palmas na frente do peito, duas vezes. Tipo: gesture, formato: bones, 3.0 s.

```json
{
  "name": "aplauso",
  "description": "Bate palmas na frente do peito, duas vezes",
  "kind": "gesture",
  "format": "bones",
  "duration": 3.0,
  "keyframes": [
    {
      "t": 0,
      "bones": {
        "leftUpperArm": {
          "levantar": 20
        },
        "rightUpperArm": {
          "levantar": 20
        }
      }
    },
    {
      "t": 0.4,
      "bones": {
        "leftUpperArm": {
          "levantar": 50,
          "frente": 80
        },
        "rightUpperArm": {
          "levantar": 50,
          "frente": 80
        },
        "leftLowerArm": {
          "dobrar": 100
        },
        "rightLowerArm": {
          "dobrar": 100
        }
      },
      "face": {
        "mouthSmileLeft": 0.4,
        "mouthSmileRight": 0.4
      }
    },
    {
      "t": 0.6,
      "bones": {
        "leftUpperArm": {
          "levantar": 50,
          "frente": 100
        },
        "rightUpperArm": {
          "levantar": 50,
          "frente": 100
        },
        "leftLowerArm": {
          "dobrar": 100
        },
        "rightLowerArm": {
          "dobrar": 100
        }
      }
    },
    {
      "t": 0.8,
      "bones": {
        "leftUpperArm": {
          "levantar": 50,
          "frente": 80
        },
        "rightUpperArm": {
          "levantar": 50,
          "frente": 80
        },
        "leftLowerArm": {
          "dobrar": 100
        },
        "rightLowerArm": {
          "dobrar": 100
        }
      }
    },
    {
      "t": 1.0,
      "bones": {
        "leftUpperArm": {
          "levantar": 50,
          "frente": 100
        },
        "rightUpperArm": {
          "levantar": 50,
          "frente": 100
        },
        "leftLowerArm": {
          "dobrar": 100
        },
        "rightLowerArm": {
          "dobrar": 100
        }
      }
    },
    {
      "t": 3.0,
      "bones": {
        "leftUpperArm": {
          "levantar": 20
        },
        "rightUpperArm": {
          "levantar": 20
        }
      }
    }
  ]
}
```

### espreguicar

Levanta os dois bracos e arqueia as costas, como quem acorda. Tipo: gesture, formato: bones, 4.0 s.

```json
{
  "name": "espreguicar",
  "description": "Levanta os dois bracos e arqueia as costas, como quem acorda",
  "kind": "gesture",
  "format": "bones",
  "duration": 4.0,
  "keyframes": [
    {
      "t": 0,
      "bones": {
        "leftUpperArm": {
          "levantar": 10
        },
        "rightUpperArm": {
          "levantar": 10
        }
      }
    },
    {
      "t": 1.2,
      "bones": {
        "leftUpperArm": {
          "levantar": 170,
          "frente": 60
        },
        "rightUpperArm": {
          "levantar": 170,
          "frente": 60
        },
        "chest": {
          "frente": -15
        },
        "spine": {
          "frente": -10
        },
        "head": {
          "frente": -15
        }
      },
      "face": {
        "jawOpen": 0.35,
        "eyeBlinkLeft": 0.7,
        "eyeBlinkRight": 0.7
      }
    },
    {
      "t": 2.6,
      "bones": {
        "leftUpperArm": {
          "levantar": 170,
          "frente": 60
        },
        "rightUpperArm": {
          "levantar": 170,
          "frente": 60
        },
        "chest": {
          "frente": -15
        },
        "spine": {
          "frente": -10
        },
        "head": {
          "frente": -15
        }
      }
    },
    {
      "t": 4.0,
      "bones": {
        "leftUpperArm": {
          "levantar": 10
        },
        "rightUpperArm": {
          "levantar": 10
        }
      }
    }
  ]
}
```

### dancinha_quadril

Balanca o quadril e os bracos de um lado para o outro. Tipo: gesture, formato: bones, 4.0 s.

```json
{
  "name": "dancinha_quadril",
  "description": "Balanca o quadril e os bracos de um lado para o outro",
  "kind": "gesture",
  "format": "bones",
  "duration": 4.0,
  "keyframes": [
    {
      "t": 0,
      "bones": {
        "hips": {
          "lado": 0
        }
      }
    },
    {
      "t": 0.5,
      "bones": {
        "hips": {
          "lado": 10,
          "girar": 10
        },
        "leftUpperArm": {
          "levantar": 70,
          "frente": 30
        },
        "rightUpperArm": {
          "levantar": 40,
          "frente": 30
        },
        "chest": {
          "lado": -6
        },
        "head": {
          "lado": -8
        }
      },
      "face": {
        "mouthSmileLeft": 0.4,
        "mouthSmileRight": 0.4
      }
    },
    {
      "t": 1.0,
      "bones": {
        "hips": {
          "lado": -10,
          "girar": -10
        },
        "leftUpperArm": {
          "levantar": 40,
          "frente": 30
        },
        "rightUpperArm": {
          "levantar": 70,
          "frente": 30
        },
        "chest": {
          "lado": 6
        },
        "head": {
          "lado": 8
        }
      }
    },
    {
      "t": 1.5,
      "bones": {
        "hips": {
          "lado": 10,
          "girar": 10
        },
        "leftUpperArm": {
          "levantar": 70,
          "frente": 30
        },
        "rightUpperArm": {
          "levantar": 40,
          "frente": 30
        },
        "chest": {
          "lado": -6
        },
        "head": {
          "lado": -8
        }
      }
    },
    {
      "t": 2.0,
      "bones": {
        "hips": {
          "lado": -10,
          "girar": -10
        },
        "leftUpperArm": {
          "levantar": 40,
          "frente": 30
        },
        "rightUpperArm": {
          "levantar": 70,
          "frente": 30
        },
        "chest": {
          "lado": 6
        },
        "head": {
          "lado": 8
        }
      }
    },
    {
      "t": 4.0,
      "bones": {
        "hips": {
          "lado": 0
        }
      }
    }
  ]
}
```

### sentada_chao

Senta no chao com as pernas esticadas a frente e os joelhos levemente dobrados. Tipo: pose, formato: bones, 6.0 s.

```json
{
  "name": "sentada_chao",
  "description": "Senta no chao com as pernas esticadas a frente e os joelhos levemente dobrados",
  "kind": "pose",
  "format": "bones",
  "duration": 6.0,
  "bones": {
    "hips": {
      "subir": -90,
      "frente": 5
    },
    "leftUpperLeg": {
      "frente": 88,
      "lado": 8
    },
    "rightUpperLeg": {
      "frente": 88,
      "lado": 8
    },
    "leftLowerLeg": {
      "dobrar": 15
    },
    "rightLowerLeg": {
      "dobrar": 15
    },
    "leftUpperArm": {
      "levantar": 25,
      "frente": 70
    },
    "rightUpperArm": {
      "levantar": 25,
      "frente": 70
    },
    "leftLowerArm": {
      "dobrar": 50
    },
    "rightLowerArm": {
      "dobrar": 50
    },
    "leftFoot": {
      "apontar": -10
    },
    "rightFoot": {
      "apontar": -10
    }
  }
}
```

### surpresa

So o rosto: surpresa, boca aberta e sobrancelhas altas. Tipo: gesture, formato: bones, 2.5 s.

```json
{
  "name": "surpresa",
  "description": "So o rosto: surpresa, boca aberta e sobrancelhas altas",
  "kind": "gesture",
  "format": "bones",
  "duration": 2.5,
  "keyframes": [
    {
      "t": 0,
      "face": {
        "jawOpen": 0
      }
    },
    {
      "t": 0.3,
      "bones": {
        "head": {
          "frente": -8
        }
      },
      "face": {
        "jawOpen": 0.4,
        "browInnerUp": 0.8,
        "browOuterUpLeft": 0.7,
        "browOuterUpRight": 0.7,
        "eyeWideLeft": 0.8,
        "eyeWideRight": 0.8
      }
    },
    {
      "t": 1.6,
      "bones": {
        "head": {
          "frente": -8
        }
      },
      "face": {
        "jawOpen": 0.4,
        "browInnerUp": 0.8,
        "browOuterUpLeft": 0.7,
        "browOuterUpRight": 0.7,
        "eyeWideLeft": 0.8,
        "eyeWideRight": 0.8
      }
    },
    {
      "t": 2.5,
      "bones": {
        "head": {
          "frente": 0
        }
      },
      "face": {
        "jawOpen": 0
      }
    }
  ]
}
```

### aceno_talkinghead

Aceno no formato TalkingHead: radianos nos ossos Ready Player Me, [min,max] sorteia um valor. Tipo: gesture, formato: talkinghead, 3.0 s.

```json
{
  "name": "aceno_talkinghead",
  "description": "Aceno no formato TalkingHead: radianos nos ossos Ready Player Me, [min,max] sorteia um valor",
  "kind": "gesture",
  "format": "talkinghead",
  "duration": 3.0,
  "props": {
    "LeftShoulder.rotation": {
      "x": [
        1.5,
        2
      ],
      "y": [
        0.2,
        0.4
      ],
      "z": [
        -1.5,
        -1.3
      ]
    },
    "LeftArm.rotation": {
      "x": [
        1.5,
        1.7
      ],
      "y": [
        -0.6,
        -0.4
      ],
      "z": [
        1,
        1.2
      ]
    },
    "LeftForeArm.rotation": {
      "x": -0.815,
      "y": [
        -0.4,
        0
      ],
      "z": 1.575
    },
    "LeftHand.rotation": {
      "x": -0.529,
      "y": -0.2,
      "z": 0.022
    }
  }
}
```

### continencia

Continencia: mao direita na testa, postura firme. Tipo: pose, formato: bones, 4.0 s.

```json
{
  "name": "continencia",
  "description": "Continencia: mao direita na testa, postura firme",
  "kind": "pose",
  "format": "bones",
  "duration": 4.0,
  "bones": {
    "rightUpperArm": {
      "levantar": 95,
      "frente": 60
    },
    "rightLowerArm": {
      "dobrar": 140
    },
    "rightHand": {
      "dobrar": 0,
      "desviar": -10
    },
    "spine": {
      "frente": -3
    },
    "head": {
      "frente": -4
    }
  },
  "face": {
    "mouthPressLeft": 0.3,
    "mouthPressRight": 0.3
  }
}
```

## Dicas para pedir à LLM

- "Crie um gesto de 3 segundos em que ela coça a cabeça com a mão direita."
- "Crie uma pose de 8 segundos de quem está cansada, ombros caídos e cabeça baixa."
- "Crie uma dança de 6 segundos que balança o quadril e os braços."
- Para corrigir: "o cotovelo está dobrando para o lado errado, troque o sinal de levantar" ou "deixe mais devagar: dobre os tempos".
- Mande o JSON, olhe o resultado, e peça um ajuste. O avatar devolve em `evt/avatar/...` os valores que cortou.
