# Direção do produto

Secretár.IA ajuda autônomos e pequenos negócios a cumprir o que combinaram,
lembrar o que importa e acompanhar o trabalho pelo WhatsApp.

## Próximos 30 dias: piloto confiável

Hipótese de público: prestadores de serviços que agendam visitas, acompanham
orçamentos e trabalham por conta própria. Validar com entrevistas antes de
tratar esse segmento como escolha definitiva.

Ordem de implementação e avaliação:

1. Continuidade por cliente: consultar registros atuais e resolver referências
   recentes sem misturar clientes. Primeiro incremento implementado neste ciclo:
   `subject_overview` e referência explícita com validade de 30 minutos.
2. Correções conversacionais de data/horário e seleção de itens: avaliar com
   diálogos e listas persistidas, sem escolher o primeiro resultado. Preservação
   de dia/hora omitidos em reagendamento parcial implementada localmente para
   tarefas e compromissos, com versão e fuso; ver RESCHEDULE-PARTS.md. Seleção
   ordinal usa um snapshot da lista efetivamente enviada: implementado localmente
   para tarefas, com validade de 15 minutos, escopo por contato/conta e revalidação
   antes de alterar. Notas/compromissos e escolha sem ação em vários turnos ainda
   não estão contemplados. Ver TASK-SELECTION.md.
3. Vínculo explícito entre tarefas e clientes/projetos: implementado localmente
   para novas tarefas/séries. Visão geral e lista filtrada incluem tarefas do
   cadastro; antigas não foram associadas automaticamente. Correção/remoção do
   vínculo de uma tarefa existente também está implementada localmente, por
   alvo inequívoco, sem reagendar aviso. Não inferir vínculo apenas pelo título.
4. Diálogos completos de visita, orçamento e retorno como cenários de regressão.
   Usar simulações para execução e avaliações separadas com IA real para medir
   interpretação. Não apresentar testes simulados como prova da qualidade do modelo.
5. Teste com 5–10 participantes consentidos do segmento escolhido, primeiro em
   número de teste e depois com número definitivo/configurações Meta adequadas.

Acompanhar: pedidos concluídos corretamente, correções exigidas, perguntas
desnecessárias, avisos aceitos/entregues, tentativas sem medição, custo observado
e uso recorrente. Estabelecer metas numéricas após a primeira medição; ainda
não existe evidência suficiente para prometer taxa de acerto ou preço sustentável.

Critério de avanço: uso repetido por semanas, poucos resgates manuais e pessoas
dispostas a pagar. Recursos novos não substituem confiabilidade.

## Horizonte de um ano

Calendário integrado, retornos aguardando terceiros, áudio em nuvem validado,
resumos escolhidos pelo usuário, painel simples, assinatura e suporte. Evoluir
conforme uso e disposição para pagar. Infraestrutura deve ter backup restaurável,
monitoramento, procedimento de recuperação e opção de migração entre fornecedores.

## Horizonte de dois anos

Assistência à operação: preparar retornos e sugerir agenda/próximos passos.
Ações externas e compromissos financeiros precisam de autorização adequada.
Permissões de equipe e atribuição de responsáveis entram quando houver procura
validada. Esses horizontes são direção e hipóteses, não compromissos de entrega.

## Estado de publicação

Continuar localmente enquanto a Railway estiver indisponível. Não trocar callback,
abrir túnel ou publicar sem retomar explicitamente a etapa de testes/deploy.
O túnel e os processos de teste iniciados foram desligados após a mudança de plano.
