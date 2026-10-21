# Conversa e anotações — primeiro incremento

A Secretár.IA acompanha pedidos incompletos, correções e anotações sem exigir um comando exato. A execução continua transacional: a resposta de confirmação é gerada após gravar a ação no banco.

## Conversa validada

1. “Amanhã preciso falar com o João sobre o orçamento. Me lembra disso.” → pergunta somente a hora, sem inventar 9h ou meia-noite.
2. “Às nove.” → cria o lembrete.
3. “Melhor nove e meia.” → altera o mesmo lembrete.
4. “Me avisa dez minutos antes.” → muda o único aviso para 9h20. Ainda não há horário de compromisso separado de múltiplos avisos.
5. “Anota que o orçamento do João é R$ 500 e a entrega ficou para sexta-feira.” → guarda uma anotação sem agendar mensagem.
6. “Qual o valor que combinei com o João?” → recupera a informação guardada.
7. “Cancela esse lembrete do João.” → cancela o mesmo registro, sem criar outro.

## Persistência e limites reais

- Anotações são eventos do tipo secretary_note com texto e índice textual normalizado. A busca consulta todas as anotações da pessoa e do número comercial; mostra até dez resultados e limita a resposta ao tamanho de uma mensagem WhatsApp.
- Rascunhos usam interpretações já persistidas. São recuperados entre as vinte últimas interações, dentro de sete dias. O histórico de falas continua curto (quatro trocas em trinta minutos); não é uma memória ilimitada de todas as conversas.
- Um rascunho guarda dia e hora parciais explicitamente. “Deixa pra lá” pode descartar o rascunho sem cancelar lembretes salvos.
- Correções usam o lembrete em foco. Casos ambíguos devem perguntar qual registro alterar.
- Mensagens de um contato aguardam ações anteriores ainda em preparação/execução. Comandos de controle continuam disponíveis para pausar mesmo com pendências.
- Notas são gravadas com o pedido e a resposta na mesma transação, respeitando o isolamento por pessoa e conta comercial. Não foram adicionadas tabelas nem migrações.
- Não há acesso automático a internet, agenda externa, arquivos ou informações que a pessoa nunca forneceu. Exclusão e edição individual de notas ficam para a próxima etapa.
- Áudio na nuvem permanece desabilitado até configurar o transcritor do servidor. O número da Meta ainda é de teste; templates fora de 24h continuam pendentes.

## Validação

Testes unitários e de integração cobrem horário inventado, preenchimento parcial, rascunho após interrupção, anotações sem duplicação, busca sem vazamento entre contas/pessoas e ordem de mensagens. `scripts/evaluate-conversation.cjs --allow-provider` usa banco local exclusivo de testes, dados fictícios e WhatsApp simulado para validar sete turnos no provedor de IA real. Não executa envios reais.
