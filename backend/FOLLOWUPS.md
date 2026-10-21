# Acompanhamento de tarefas — incremento local

## Como usar

- “Já cobrei, agora estou aguardando o João” → `mark_waiting`: mantém a tarefa ativa, registra quem/o que aguarda e suspende seus avisos pendentes. Não envia mensagem ao João nem agenda aviso por dedução.
- “Estou aguardando o João; me avisa amanhã às nove” → espera com novo horário explícito. Dia/hora inválidos ou avisos pausados impedem a alteração.
- “O que está aguardando?”, “o que concluí hoje?”, “quais tarefas estão atrasadas?” → consulta persistida com filtro. Na consulta de concluídas/canceladas, o período é o da mudança de estado; registros antigos sem essa data usam a última atualização disponível.
- “Retoma essa tarefa e me lembra sexta às dez” → reagenda e volta a pendente.
- “Já resolvi, pode concluir” → conclui a tarefa e cancela sua pendência de agendamento. Aviso cujo envio já começou pode ainda chegar; a aplicação informa isso.
- “Corrige só o título para Confirmar aprovação com Maria” → corrige uma tarefa avulsa sem mudar o horário. Jobs anteriores ficam inválidos por versão. Editar um aviso já aceito não agenda outro envio. A edição é recusada se o resultado de envio estiver desconhecido.
- “Apaga o orçamento do cadastro do cliente João Silva” → remove o campo e suas revisões do cadastro. Não apaga mensagens originais ou anotações gerais, não exclui outros campos e não equivale a uma solicitação completa de eliminação de dados pessoais.

Os comandos acima dependem de interpretação. O domínio e os contratos foram testados com interpretações simuladas; a avaliação ampliada com o provedor real está preparada e ainda precisa ser executada antes do piloto.

## Persistência e segurança

`taskProgress` é independente do status de envio: pending, waiting, completed, cancelled. `waitingFor` tem até 120 caracteres. `progressUpdatedAt` registra a mudança. Uma tarefa pode aguardar alguém com um aviso futuro explicitamente solicitado. A entrega de um aviso não conclui a tarefa.

Migração aditiva `20261021030000_task_progress`: acrescenta os campos, inicializa o progresso de registros concluídos/cancelados e cria um índice. Aplicada apenas ao banco isolado local `secretaria_inbox_test` nesta sessão. Nenhuma migração em produção. Workers aguardam os campos antes de consumir mensagens/jobs em publicação gradual.

CAS por versão/estado e transação protegem alterações concorrentes. Marcar espera suspende a versão anterior; envio em andamento ou incerto bloqueia a alteração. Eventos registram alterações sem imprimir conteúdo pessoal em logs. A operação administrativa acrescenta apenas contagens por progresso, sem nomes/textos.

O contexto oferece até três avisos recentes da própria pessoa/conta. Aceitação do provedor e recibos são identificados separadamente; não se deve presumir leitura. Referências ambíguas continuam pedindo esclarecimento.

## Correções de confiabilidade nesta sessão

- Hora sem dia informado vira rascunho com a hora preservada, em vez de aceitar um dia inventado pelo modelo. Dia sem hora continua pedindo hora. Datas por extenso e durações simples são aceitas.
- Dois compromissos diferentes com horários não viram uma criação parcial silenciosa. Um evento com múltiplos avisos continua permitido.
- Acrescentar aviso futuro a compromisso mantém um antecipado já aceito e vencido, sem rejeitar o pedido nem reenviar o aviso antigo.

## Verificação reproduzível

No backend, `npm run check:pilot -- --integration` executa tipos, unidade e integração. Usa apenas banco local terminado em `_test`; ao derivar da configuração local, escolhe `secretaria_inbox_test`. Não aceita URL remota para integração. Credenciais OpenAI e Meta são retiradas do ambiente dos testes; envios e interpretação são simulados.

`--migrate-test` junto de `--integration` gera o cliente Prisma e aplica migrações somente nesse banco de testes. Sem esse parâmetro, não executa migração. O comando não publica nem inicia workers persistentes.

`scripts/evaluate-business.cjs --allow-provider` foi ampliado para 21 turnos, incluindo consulta de histórico, remoção de dado, espera, correção e conclusão. Requer build atualizado, chave e banco local de teste; usa tokens do provedor e WhatsApp simulado. Não foi executado nesta sessão para evitar consumo pago sem autorização específica.

## Limites que permanecem

Não há contato com terceiros, cobrança, resumo proativo automático, integração com calendário externo, edição de título de compromissos, exclusão completa de mensagens nem fuso individual configurável na conversa. Áudio na nuvem, número definitivo e templates fora da janela mantêm as pendências anteriores. Não há garantia de entrega única do provedor: envios incertos são conservados para investigação, sem reenvio automático cego.
