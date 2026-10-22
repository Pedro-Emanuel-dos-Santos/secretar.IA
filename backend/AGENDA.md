# Agenda por período

Incremento local, sem migração nova, publicação ou alteração do callback.

Apresentação revisada em 22/10: hoje/amanhã mostram uma única data no cabeçalho
e somente a hora em cada item. Semanas e outros períodos com mais de um dia
conservam dia/mês em cada linha para distinguir horários iguais em dias diferentes.
Intervalos personalizados continuam mostrando início/fim completos e fim
exclusivo. O nome completo do cliente não é repetido quando já aparece no título;
nomes parciais mantêm o vínculo visível. Espera, resultados adicionais, pausa e
avisos não enviados conservam suas informações. Não houve mudança nas consultas.
Contagens zeradas não aparecem quando há apenas tarefas ou apenas compromissos.
Um período sem itens recebe uma frase explícita sobre a ausência de registros
nesse intervalo, sem afirmar que a pessoa está livre ou que resolveu pendências.
Espera, avisos anteriores e pausa continuam aparecendo mesmo nesse caso.

Consultas locais, sem interpretação com IA:

- MINHA SEMANA / “Como está minha semana?”
- PRÓXIMA SEMANA
- RESUMO DE AMANHÃ / “O que tenho amanhã?”
- RESUMO DE DEPOIS DE AMANHÃ / “O que tenho depois de amanhã?”
- PRÓXIMOS 7 DIAS

Pedidos fora desses comandos podem usar agenda_overview com agendaPeriod:
today, tomorrow, day_after_tomorrow, week, next_week ou next_7_days. Pode filtrar por cliente/projeto
com subject/subjectKind ou usar rangeStart/rangeEnd em vez de agendaPeriod,
com fuso explícito e até 31 dias de calendário. Não misturar período pronto e
intervalo personalizado. Filtros por estado ainda usam as listas de tarefas;
a agenda pede esclarecimento em vez de ignorá-los.

Semana significa segunda a domingo, incluindo dias já passados da semana atual.
Próximos sete dias inclui hoje e os seis dias seguintes. Os limites são inclusivos
no início e exclusivos no fim, calculados no fuso do perfil e na data de recebimento
da mensagem. Semanas com transição de offset não presumem duração de 168 horas.
“Depois de amanhã” usa o segundo dia local após o recebimento, mesmo ao virar
mês/ano ou mudar o offset. O pedido direto consulta sem IA; com cliente/projeto,
a interpretação preserva o cadastro e o servidor confere esse período explícito.
“Amanhã e depois de amanhã” pede qual consultar primeiro, sem escolher um sozinho.

Avaliação com IA real em 22/10: o modelo inicialmente escolheu list_reminders
para uma pergunta explícita pela agenda da Ana. A guarda agora encaminha esse
caso para agenda_overview, sem herdar filtro de tarefa e preservando cadastro
explícito do contexto. Pedidos que mencionam tarefas/lembretes/estados continuam
nas listas; homônimos de cliente/projeto pedem esclarecimento. O modo
`evaluate-business.cjs --allow-provider --agenda` passou em três turnos: tarefa
vinculada às 09:00 no segundo dia local, agenda desse cliente nesse dia e
consulta de amanhã sem misturar a tarefa. Banco isolado, dados fictícios e
WhatsApp simulado; nenhum envio real nem confirmação de agendamento da fila.

Continuação por pronome: “e a agenda dela amanhã?” também força consulta real
quando o modelo sugerir conversa sem buscar registros. Usa somente o cadastro
recente confiável do contexto; sem referência pede nome, e comentário negando
a consulta não a dispara. A avaliação --agenda passou em cinco turnos, mantendo
Ana Souza ao alternar amanhã/depois de amanhã e sem modificar o horário salvo.

A consulta reúne compromissos ativos pelo horário real e tarefas pendentes pelo
horário do aviso. Os avisos vinculados a compromissos não reaparecem como tarefas
avulsas; resumos diários automáticos também não entram. “Compromisso registrado”
não afirma que um evento passado ocorreu. Aviso aceito pelo provedor não conclui
a tarefa. Horário do aviso não é tratado como prazo comercial.

Retornos aguardando resposta aparecem em seção própria, incluindo avisos fora
do período, com essa abrangência declarada. Pendências com aviso anterior ao
período são contadas separadamente, sem afirmar que uma tarefa futura está atrasada.

Até oito itens cronológicos e três retornos são detalhados. Contagens vêm do
banco e a resposta avisa quando há mais resultados. Consulta não altera tarefa,
estado de pausa, agenda ou fila. Os itens são isolados por contato e conta comercial.
Essa visão não é uma lista de seleção ordinal: para escolher “o segundo”, peça
uma lista de tarefas numerada.

Agenda de cliente/projeto: usa apenas vínculos estruturados de tarefas e
compromissos. Nomes parecidos não criam associações. Cliente e projeto homônimos
exigem tipo claro na conversa. Cadastro desconhecido ou parcial não cai na agenda
geral. subject_overview com período/intervalo consulta essa agenda filtrada;
sem período mantém a visão geral com dados atuais e notas. A agenda temporal
não inclui fatos/notas sem vínculo temporal. Retornos em espera do mesmo cadastro
continuam na seção explicitamente abrangendo avisos fora do período.

Intervalo personalizado tem início inclusivo e fim exclusivo. A resposta mostra
os horários de ambos os limites e identifica o fim exclusivo. Intervalo incompleto,
invertido, sem fuso ou maior que 31 dias pede correção. Na preparação, expressões
como “nesta semana” preservam o período mesmo se o modelo responder conversa;
períodos conflitantes ou datas/horários não interpretados não devolvem todos os
registros como se fossem uma consulta filtrada.

O build e os testes locais usam provedores simulados. A interpretação de pedidos
livres com IA real e o teste no WhatsApp continuam pendentes; os comandos locais
não fazem chamada de IA.

Resultado deste incremento: build/TypeScript, 161 testes unitários e 178 de
integração passaram. Inclui seis cenários unitários de calendário/contrato e
cinco integrações específicas de agenda (conteúdo, limite de período, ausência
de chamada à IA local, tamanho/contagens e caminho interpretado pelo inbox).

Incremento de cliente/período: build/TypeScript, 166 unitários e suíte com 184
integrações passaram. Os seis cenários específicos passaram novamente após o
último ajuste. Cobrem homônimos, escopo, limites, intervalos inválidos e o diálogo
com pronome pelo inbox. Provedores simulados; interpretação real ainda pendente.
