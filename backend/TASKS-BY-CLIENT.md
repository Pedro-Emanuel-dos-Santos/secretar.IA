# Tarefas por cliente ou projeto

Incremento local, ainda não publicado nem avaliado com IA real.

Validação: build e TypeScript passaram; 138 testes unitários e 149 de integração
passaram, incluindo oito cenários específicos deste incremento. Banco local
isolado e provedores simulados, sem mensagem real ou chamada paga de IA.

Exemplos para a avaliação final:

- “Me lembra amanhã às nove de enviar o orçamento para a Ana.”
- “O que tenho com a Ana?”
- “Lista as tarefas pendentes da Ana.”
- “E as que estão aguardando resposta dela?”

create_reminder recebe subject e subjectKind (client/project). A preparação exige
o nome no texto atual ou no pedido original do rascunho. Uma referência antiga
não autoriza silenciosamente vincular uma nova tarefa. O cadastro é criado se o
nome completo não existir; fragmento de nome conhecido pede esclarecimento.

Todas as ocorrências da série conservam o vínculo. A transação inclui cadastro,
tarefas e outboxes. Reentrega da mesma origem não duplica criação. Consultas
continuam isoladas por pessoa e número comercial; cliente e projeto com o mesmo
nome são cadastros diferentes.

subject_overview mostra tarefas ativas vinculadas, inclusive aguardando resposta,
sem incluir concluídas/canceladas ou avisos de compromissos como tarefas avulsas.
list_reminders aceita subject e preserva filtros de progresso e período. A lista
e a confirmação de criação exibem o nome do cadastro, assim como o próprio aviso. A aceitação de um aviso
pelo provedor não significa que a tarefa foi concluída.

Limites: tarefas antigas ficam sem vínculo; nomes no título não bastam para
associá-las. Alteração de vínculo em tarefa existente não foi implementada neste
incremento. A data exibida é a do aviso da tarefa, não um prazo comercial inferido.
Antes de usar este build no banco pessoal ou produção, fazer backup e aplicar
20261021150000_tasks_by_subject. Esta etapa migrou somente secretaria_inbox_test.
