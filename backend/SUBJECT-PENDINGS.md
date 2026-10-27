# Pendências de assunto sem prazo — 27/10/2026

Incremento local do plano ASSUNTOS-E-ACOMPANHAMENTO.md. Não publicado.

## Comportamento

Uma pendência é um trabalho a acompanhar; um Reminder é um aviso com horário.
O novo modelo SubjectPending separa os dois. Nenhuma ação deste incremento cria
ou modifica Reminder, ScheduleOutbox ou envio WhatsApp a terceiros.

Para um projeto já cadastrado, exemplos de pedidos:

- “Registra a pendência Assinatura do contrato no projeto Avenida Beira Rio,
  aguardando Evandro. Próxima ação: cobrar retorno sobre a assinatura.”
- “Mostra as pendências do projeto Avenida Beira Rio.”
- “Atualiza a próxima ação da pendência Assinatura do contrato do projeto Avenida
  Beira Rio: solicitar posição a Evandro, continuamos aguardando.”
- “Conclui a pendência Assinatura do contrato do projeto Avenida Beira Rio.”

A interpretação usa create_subject_pending, list_subject_pendings e
update_subject_pending. Uma atualização localiza o título exato em search e o
cadastro por subject/subjectKind; não usa ID arbitrário gerado pelo modelo.
Escritas exigem nome explícito do assunto. Leituras podem usar o foco recente
confirmado, revalidando contato e conta. Dois assuntos explícitos pedem escolha.

## Persistência e controles

- Estados: pending, waiting, completed e cancelled. Interlocutor de espera deve
  constar no texto de origem; conclusão/cancelamento precisam ser explícitos.
- Próxima ação é opcional e fornecida pelo usuário. Não é autorização para
  executar a ação externa. Responsáveis de equipe não estão implementados.
- Mensagem de origem, versão, timestamps e eventos de criação/alteração.
- Repetição da mesma mensagem é idempotente; criações concorrentes do mesmo
  título aberto são serializadas pela linha do usuário.
- Até 100 pendências abertas por contato/conta; listagem mostra dez com aviso de
  existência de mais itens. Resumo do assunto mostra até oito com aviso de limite.
- Atualizações preservam a espera se o usuário só muda a próxima ação. Estado
  atual e evento de auditoria são gravados na mesma transação da resposta.
- O resumo subject_overview inclui as pendências abertas e suas próximas ações.
- MEU DIA inclui contagem e três pendências sem prazo atualizadas recentemente,
  com nome do assunto, espera e próxima ação. Não as classifica como vencidas
  ou como compromissos do dia. Estados concluído/cancelado ficam fora dessa seção.
- Limpeza de dados existente elimina pendências por cascade do cadastro do
  assunto; eventos seguem o escopo da conta. Há regressão específica disso.

## Limites deliberados

Não há prazo, aviso ou tarefa recorrente neste modelo. Um pedido com prazo/aviso
não pode perder essa parte silenciosamente: o executor pede esclarecimento.
Não converte uma atualização factual em pendência automaticamente, não confirma
decisões formais, não cria equipe e não compartilha memória institucional.
Fato e pendência na mesma interpretação são recusados como operação composta;
propostas com confirmação e execução composta ainda são a próxima entrega.

Histórico técnico está nos eventos; uma interface conversacional para navegar
todo esse histórico de pendências ainda não foi implementada. A consulta de
histórico de fatos continua sendo separada.

## Migração e publicação futura

Validação local: 243 testes unitários aprovados; suíte completa com 240 testes
de integração aprovada; repetição final dos 11 cenários de pendências aprovada,
incluindo continuidade em dois turnos. TypeScript aprovado após a revisão final.
O total de 11 é uma repetição dos casos afetados, não 11 casos extras da suíte.
Logs subject-pending-* na workspace. Interpretação e provedores são simulados.
Imagem final local secretaria-ia:subject-pending-release-20261027 construída com
sucesso; inclui o cliente Prisma regenerado e a migração aditiva. Não publicada.
Essa imagem é do núcleo de pendências, anterior ao acréscimo em MEU DIA. Para
publicar a árvore atual, construir nova imagem. Acréscimo em MEU DIA validado
separadamente por TypeScript e 47 integrações de pendências, fatos e resumos
diários; o resumo programado continua dependendo do opt-in existente.

20261027170000_add_subject_pendings é aditiva: nova tabela e relações, sem alterar
dados/colunas de Reminder. Cliente Prisma precisa ser regenerado. Migração foi
aplicada somente a secretaria_inbox_test local. O worker de entrada aguarda a
nova tabela antes de interpretar mensagens, preservando tentativas durante rollout.

Antes de publicar a versão integrada, construir imagem final, revisar backup e
aplicar migração pelo fluxo da API. Não copiar o banco de testes nem habilitar
dados institucionais para validar este incremento. Testes automatizados usam
interpretação simulada; avaliação da IA e conversa WhatsApp reais continuam
necessárias antes de tratar o fluxo como comprovado para uso cotidiano.
