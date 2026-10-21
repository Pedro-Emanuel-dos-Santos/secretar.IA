# Seleção de tarefas por posição

Incremento local, sem publicação, alteração do callback ou migração nova.

Após a resposta de uma consulta list_reminders, o usuário pode dizer “conclui o
segundo”, “cancela a primeira” ou “reagenda o item 2 para amanhã às nove”. O modelo
interpreta a ação e os demais argumentos; o servidor resolve a identidade pela
ordem exata da lista registrada, não pela ordem atual do banco ou pelo ID sugerido
pelo modelo.

O snapshot registra os primeiros dez itens efetivamente incluídos na resposta,
com IDs, versões, estado, progresso, título e horário. Fica no Event, na mesma
transação da ação e da resposta. Só pode ser usado após o provedor aceitar o
envio. Essa aceitação não comprova leitura pelo usuário. Resposta pendente ou
incerta não autoriza seleção. O snapshot expira em quinze minutos e outra
resposta enviada encerra a referência; é isolado por contato e conta comercial.

Antes de escrever, o executor relê a lista válida, bloqueia a linha da tarefa e
confere os campos do snapshot. Se a tarefa mudou, pede nova consulta. Inserir
outra tarefa não desloca as posições da lista antiga. Concluir/cancelar duas
posições de uma vez, referências negativas e cancelamento de série não são
autorizados por esse mecanismo.

Escolha em dois turnos: “o segundo” identifica o item e persiste uma referência
sem alterar a tarefa. Depois de a resposta identificando o item ter envio aceito,
“pode concluir” ou “pode cancelar” atua nessa referência. Ela vale até cinco
minutos, respeitando também os quinze minutos da lista original. Outra resposta
enviada, lista nova ou consumo da escolha encerra a referência. A confirmação
confere estado, versão, título, horário, progresso e cliente novamente. O consumo
da referência e a alteração da tarefa são transacionais; rollback restaura ambos.
“Sim” sozinho e pedidos negados não autorizam uma ação.

Limites: apenas listas numeradas de tarefas. Não aplica a listas de notas,
compromissos ou resumos gerais. A continuidade da escolha cobre concluir/cancelar;
para reagendar, editar título ou cliente, use um pedido completo com alvo claro.
Expressões de duração e dias da semana não devem virar seleção ordinal.

Validação local: build/TypeScript e 143 testes unitários passaram. Suíte completa
com 155 integrações passou; cenários incluem títulos iguais, envio pendente ou
incerto, reordenação do banco, edição após consulta, validade, isolamento e
revalidação entre interpretação e execução. Provedores simulados; ainda falta
avaliar os diálogos com IA real e, após publicar, no WhatsApp.

Incremento de continuidade: build/TypeScript, 155 unitários e suíte completa com
173 integrações passaram. Os seis cenários específicos cobrem confirmação em
outro turno, envio pendente/incerto, validade/escopo, atualização posterior,
consumo único e rollback. Provedores simulados; avaliação real continua pendente.
