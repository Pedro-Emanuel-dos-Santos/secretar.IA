# Agenda por período

Incremento local, sem migração nova, publicação ou alteração do callback.

Consultas locais, sem interpretação com IA:

- MINHA SEMANA / “Como está minha semana?”
- PRÓXIMA SEMANA
- RESUMO DE AMANHÃ / “O que tenho amanhã?”
- PRÓXIMOS 7 DIAS

Pedidos fora desses comandos podem usar agenda_overview com agendaPeriod:
today, tomorrow, week, next_week ou next_7_days. O executor exige período e não
ignora filtros por cliente, estado ou intervalo personalizado: pede esclarecimento
em vez de mostrar uma visão geral diferente da solicitada.

Semana significa segunda a domingo, incluindo dias já passados da semana atual.
Próximos sete dias inclui hoje e os seis dias seguintes. Os limites são inclusivos
no início e exclusivos no fim, calculados no fuso do perfil e na data de recebimento
da mensagem. Semanas com transição de offset não presumem duração de 168 horas.

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

O build e os testes locais usam provedores simulados. A interpretação de pedidos
livres com IA real e o teste no WhatsApp continuam pendentes; os comandos locais
não fazem chamada de IA.

Resultado deste incremento: build/TypeScript, 161 testes unitários e 178 de
integração passaram. Inclui seis cenários unitários de calendário/contrato e
cinco integrações específicas de agenda (conteúdo, limite de período, ausência
de chamada à IA local, tamanho/contagens e caminho interpretado pelo inbox).
