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

Tarefas existentes: set_task_subject corrige o cliente/projeto por reminderId
exato ou busca inequívoca; clearSubject=true remove o vínculo, com pedido explícito
e não negado. Requer tarefa ativa; avisos de compromissos e envio em andamento
ou incerto são recusados. A atualização registra auditoria, preserva horário,
progresso, estado, versão de agendamento e outbox; não republica o job. Não
apaga o cadastro anterior e não altera toda a série. Mudança do vínculo invalida
snapshots de listas antigas, sem invalidar o job do aviso.

Limites: tarefas antigas ficam sem vínculo até pedido explícito; nomes no título
não bastam para associá-las. Correção por ordinal não está habilitada; usar título
ou identificador inequívoco. A data exibida é a do aviso da tarefa, não um prazo comercial inferido.
Antes de usar este build no banco pessoal ou produção, fazer backup e aplicar
20261021150000_tasks_by_subject. Esta etapa migrou somente secretaria_inbox_test.

Validação da correção de vínculo: build e TypeScript passaram. Suíte com 143
unitários e 162 integrações passou; oito cenários específicos passaram novamente
após o último ajuste, incluindo um novo caso de aviso de compromisso. A próxima
execução completa inclui 163 integrações. Nenhuma migração adicional ou chamada
real de IA/WhatsApp foi feita para essa correção; avaliação conversacional real
continua pendente.
