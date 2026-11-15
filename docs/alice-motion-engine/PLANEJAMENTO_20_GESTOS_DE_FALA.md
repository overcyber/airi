# Plano 20: gestos de fala

## Problema

1. O avatar gesticulava antes de o áudio chegar. O gesto começava quando o texto chegava, e o áudio vinha depois da síntese de voz.
2. Os gestos de fala eram poucos e se repetiam. Um clipe de fala em laço soma movimento de braço o tempo todo.

## Causa do problema 1

Na ponte NeoAlice, a função `speak()` chamava `runtime.speechStarted` e tocava o gesto do `SpeechGesturePicker` antes de pedir o áudio. A pose de pensar também terminava nesse momento.

## Mudanças

- `playSpeech` recebe `onStart`. O `Stage.vue` chama `onStart` quando o áudio começa a tocar.
- Na ponte, `speechStarted`, o gesto do picker e o fim da pose de pensar acontecem em `beginPerformance`, chamado por `onStart`. Sem áudio, ele roda junto com a legenda. No fim, a pose de pensar sempre termina.
- Novo `SpeechGestureChoreographer` (`packages/stage-ui-three/src/composables/vrm/speech-gestures.ts`). Ele começa com o texto da frase, quando o áudio começa, e para com a fala.
- Novo catálogo `speech-gesture-beats.ts`: 24 tipos de gesto, entre eles palma aberta, oferecer, cortar, jogar, círculo, pinça, apontar, mão no peito, contar 1, 2 e 3 com os dedos, as duas mãos abertas, para baixo, largas e juntas, encolher de ombros, dispensar, apresentar, bater leve, inclinar, acenar, aproximar e girar a cabeça.
- Cada gesto muda a cada uso: mão (direita em 65%), amplitude, ritmo e pequenas variações de ângulo. Os ângulos ficam nos limites do banco de ossos.
- A escolha usa o trecho do texto que é falado naquele momento. Pergunta, negação, "eu", "você", números, "muito" e "pouco" pesam o sorteio. Os últimos 5 gestos não se repetem.
- As pausas variam. A fala mais viva gesticula mais. No fim da frase, nenhum gesto começa. Com outro gesto, pose segurada, deitada ou modo noite, o coreógrafo espera.
- O rosto mantém o humor e o piscar durante esses gestos.
- O clipe de fala em laço caiu para 12 a 22% do peso, só como balanço de fundo.

## Evidência

`evidencias/D20/gestos-conversa-peito.png`: palma aberta, contar 2, duas mãos abertas e cortar, na Eva. As mãos ficam na altura do peito.

## Testes

- `speech-gestures.test.ts`: os 24 gestos passam no `parseCustomMotion` sem aviso, em 2 mãos e 3 amplitudes. Sem gesto antes do início ou depois do fim. Primeiro gesto com atraso. Sem gesto com o corpo ocupado. Variedade, sem repetição seguida, determinismo e intervalo mínimo.
- `avatar-animator.test.ts`: faixa de peso do clipe de fala.

## Pendência

Não há teste automatizado da ponte `speak()`. A ordem foi conferida só pelo typecheck e pela leitura do código.
