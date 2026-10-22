# Conversa natural: implementação e avaliação

A meta é acompanhar a pessoa, com perguntas pertinentes e respostas curtas.
Não basta variar frases ou colocar gírias em mensagens de sistema. Naturalidade
não autoriza fingir ser humana, inventar memória ou afirmar execução antes do banco.

## Alterações locais deste incremento

- Prompt pede português brasileiro de conversa, sem apresentação repetida,
  perguntas de encerramento automáticas, apelidos ou entusiasmo forçado.
- Perguntas de tarefa/compromisso pedem somente dia ou hora quando a outra
  parte já está informada. A pergunta de tarefa pode mencionar o dia conhecido.
- Confirmações usam hoje/amanhã pelo calendário do fuso, e data completa para
  outros dias. A confirmação de tarefa é refeita pelo fluxo de envio existente,
  usando o momento do envio; mudar o dia não muda o instante salvo.
- Compromissos descrevem avisos como “1 hora antes” ou “na hora”. Quantidade
  e antecedência vêm dos avisos reais criados, sem prometer envio confirmado.
- Contagens de agenda e resumo diário usam singular/plural correto.
- Confirmação de série fica curta, com quantidade total e ressalva de meses
  sem aquele dia quando aplicável. Não repete um tutorial de cancelamento.
- Escolha de tarefa identifica o título de forma direta.

Não há chamada adicional de IA para reescrever confirmações de execução.
Confirmações continuam baseadas no resultado persistido, não no reply do modelo.
Avisos pendentes, incertos, recusados ou pausados continuam sendo informados.

## Avaliação com IA real em 22/10

O modo `scripts/evaluate-business.cjs --allow-provider --natural` passou em
11 turnos, com dados fictícios, banco local isolado e envio WhatsApp simulado.
Conferiu o instante 09:30, correção para 10:00 sem trocar o dia nem duplicar,
comentários sem criar/concluir tarefas, desistência de rascunho sem cancelar
tarefa salva e escolha do segundo item seguida de conclusão somente dele.
Isso cobre uma conversa, não todos os cenários abaixo nem garantia do modelo.

A revisão das respostas encontrou ofertas genéricas após agradecimento/comentário.
Na etapa seguinte, o prompt recebeu exemplos de reconhecimentos curtos e pedidos
misturados. Agradecimentos completos e inequívocos são respondidos sem IA;
mensagens com negação, pergunta ou novo pedido continuam para interpretação.
Um “Valeu!” chegou a ser interpretado como retomada de reagendamento durante a
avaliação, justificando esse tratamento restrito. O avaliador agora verifica
ofertas genéricas e casos com mudança de assunto; não apenas a ação escolhida.
A avaliação ampliada passou em 15 turnos, com IA real nos pedidos/comentários
e respostas locais nos agradecimentos completos: nenhuma oferta genérica
detectada nesse diálogo. Pedido de agenda após agradecimento consultou dados
reais sem carregar o filtro anterior; pedido de lembrete após “só queria
comentar” foi salvo. Comentários finais mantiveram tarefas e horários intactos.
Ainda houve repetição de “Entendi, acabou passando” em comentários diferentes;
portanto, variedade e adequação do reconhecimento continuam merecendo revisão.

Etapa seguinte: exemplos passaram a distinguir esquecimento, dia corrido, boa
notícia e demora de resposta. A rodada de 17 turnos passou, com reconhecimentos
diferentes e tarefas/horários preservados. A revisão humana da saída encontrou
“registrando seu comentário”, que poderia sugerir criação de nota inexistente.
Foi acrescentada orientação explícita contra promessas de memória em conversation.
O novo modo `--comments` avaliou três mensagens diferentes das frases de exemplo,
com IA real e sem WhatsApp real: passou sem ofertas detectadas, criação de
lembrete ou afirmação de anotação. Build e 175 unitários passaram nesta etapa;
a suíte de 184 integrações passou no incremento anterior. Não há alteração de
schema ou da execução de tarefas neste incremento de prompt/avaliação.
Isso melhora os cenários avaliados, sem garantir variedade ou entendimento em
todas as conversas; frases semelhantes aos exemplos ainda podem aparecer.
Também encontrou nome completo duplicado no título e no vínculo: corrigido em
confirmações, listas de tarefas e avisos, preservando nomes parciais/homônimos.
O avaliador falha com diagnóstico claro se o banco estiver desligado.

Referência para exemplos no prompt: [OpenAI Docs — Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering).

Executar após build, com `AI_MODE=openai` e `INBOX_TEST_DATABASE_URL` local
terminado em `_test`. Requer chave do provedor e consome tokens; não executa
envios reais. O resultado funcional e as observações de estilo são separados.

## Roteiro adicional de avaliação com IA real

Usar dados fictícios e WhatsApp simulado antes de publicar. Os exemplos abaixo
orientam a avaliação; não são textos obrigatórios nem resultados já comprovados.

1. “Amanhã preciso mandar o orçamento para a Ana.” → perguntar só a hora se
   o contexto indicar um pedido de lembrete; se for apenas um comentário, não
   afirmar que criou o aviso sem intenção clara.
2. “Nove e meia.” → completar o pedido anterior, sem pedir novamente o dia.
3. “Valeu!” → agradecimento breve, sem oferecer automaticamente outro cadastro.
4. “Melhor às dez.” → corrigir a mesma tarefa, sem criar outra nem trocar o dia.
5. “O que tenho com ela nesta semana?” → consultar o cadastro e período certos;
   sem referência clara, perguntar de quem se trata.
6. “O segundo.” → identificar a escolha. “Pode concluir.” → concluir só esse
   item, após revalidar. “Não conclui.” → não concluir.
7. “Putz, esqueci de mandar.” → reconhecer o comentário, sem inventar ação
   concluída ou agendar outro aviso por conta própria.
8. “Isso era da Bia, não da Ana.” → esclarecer/usar o alvo inequívoco da tarefa;
   não renomear clientes nem trocar várias tarefas automaticamente.
9. “Como está minha semana?” → apresentar registros reais com horários claros,
   sem texto introdutório longo nem duplicar os avisos dos compromissos.
10. “Não, deixa.” → abandonar o rascunho pertinente, sem cancelar itens salvos.
11. “Só queria comentar mesmo.” → conversar brevemente, sem insistir em criar
    uma tarefa, horário ou anotação.
12. Pedido sem contexto ou com duas referências possíveis → uma pergunta curta
    sobre o alvo, evitando perguntar título, dia e hora de uma vez.

Anotar por diálogo: ação correta, referência correta, perguntas repetidas,
ofertas desnecessárias, respostas longas, dados inventados e execução indevida.
Erros de interpretação viram cenários antes de novos recursos.

## Verificação e retomada

TypeScript, build, 172 testes unitários e git diff --check passaram.
A revisão de permissões havia falhado por limite de uso, sem apontar risco.
Na retomada ela voltou a funcionar, e a validação com banco foi iniciada sem
contornar a revisão. A expectativa antiga de 09:30 na frase do compromisso foi
substituída por “30 minutos antes”, mantendo uma asserção independente do instante
real 12:30 UTC (09:30 em Brasília) no banco. A rodada final passou: 172 testes
unitários e 184 integrações, além do build. Nenhum deploy, callback, mensagem
real ou chamada paga foi feito.

Validação reproduzível no backend:

    npm run check:pilot -- --integration
    npm run build

O incremento foi preparado para commit local após a validação. Avaliação com IA real é uma etapa
separada; os testes unitários não comprovam que o modelo sempre conversará bem.
