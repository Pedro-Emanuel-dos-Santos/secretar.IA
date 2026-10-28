# Procedimento de publicação coordenada e recuperação

Preparado em 28/10/2026. **Não executado.** Cada alteração remota, restauração,
normalização de dados ou envio real depende de autorização concreta de Pedro.

## Baseline conferida por leitura nesta missão

Projeto 5ae6cd0c-9e1b-46df-9916-8b18d77244a9, ambiente production.
API, inbox e lembretes continuam acompanhando `codex/railway-ready-20261020`.
Deploys ativos consultados: API 6ab19165-f02d-454a-b181-729dd5de3cd7;
inbox 1150569b-927b-472d-b64b-94a65e508c32;
lembretes 614ab584-6b70-4083-81d6-f0fb781dba11. Sem alterações staged informadas.
Start dos workers: `node dist/inbox-worker.js` e
`node dist/queue/reminder.worker.js`. API tem pre-deploy Prisma migrate deploy.

O snapshot de produção corresponde à entrega anterior registrada em a072f63;
revalidar refs e configuração no dia da publicação. A branch de desenvolvimento
não deve ser vinculada automaticamente a produção durante a revisão.

## Preparação obrigatória

1. Identificar SHA de release, SHA anterior, ambiente e serviços exatos. Registrar
   plano de contenção, janela e responsável; manter credenciais fora do relatório.
2. Confirmar snapshot/backup recuperável de PostgreSQL e mecanismo de persistência
   de Redis. Registrar identificador, data, retenção e resultado de restauração
   em ambiente isolado compatível com a versão principal de PostgreSQL hospedada.
   Não usar banco de produção como destino de ensaio nem expor banco publicamente.
3. Inventariar, por conta, backlog de entrada, leases em interpretação/execução,
   outboxes pendentes, jobs e estados sending/delivery_unknown. Resolver ou
   documentar cada envio incerto; não redefini-lo como pendente às cegas.
4. Confirmar versão Node, dependências fixadas, checks finais da release, schema
   gerado e configuração efetiva dos três serviços (o arquivo railway.json não
   substitui o que está aplicado no painel).
5. Preparar WABA/template real, idioma, permissão de leitura de metadados e flag
   revisada; AI_MODE=openai e modelo avaliado. Nenhuma chave deve ser copiada do
   .env antigo ou impressa. Memória exige aceite por usuário e provedor.

## Ordem da publicação autorizada

1. Suspender consumo dos dois workers com procedimento operacional escolhido;
   aguardar operações em andamento, respeitando shutdown e leases. Manter a API
   recebendo e persistindo webhooks, se o banco estiver saudável. Não apagar fila.
2. Confirmar backup e contagens do momento antes da migração. Se API/banco estiverem
   indisponíveis, responder falha para permitir reentrega do provedor, sem sucesso falso.
3. Aplicar a migração aditiva 20261028180000_reliable_delivery_ai_usage pela API
   e verificar campos/tipos. Missão 03 não introduz outra migração nem extensão.
4. Publicar a mesma release nos três serviços mantendo consumo contido. Verificar
   logs de início, schema, comandos e readiness. Não deixar workers antigos e novos
   disputarem jobs de delivery_retry: o código antigo pode descartá-los.
5. Liberar os consumidores novos e observar recuperação do backlog, falhas,
   latências, entrega, exaustão de retries e uso de IA. Os workers novos aguardam
   os campos, mas isso não substitui a contenção durante troca entre versões.
6. Executar probe de template somente de leitura e jornadas autorizadas de texto,
   lembrete, correção e recuperação contextual. Um teste curto não substitui entrega
   fora da janela. Confirmar recibo e estado persistido, não só HTTP 200.
7. Não abrir o beta ao participante enquanto os bloqueios do PLANO_BETA.md permanecerem.

## Compatibilidade e rollback

Migração anterior só adiciona campos: queries antigas continuam estruturalmente
compatíveis, mas **estados novos não são compatíveis com consumidores antigos**.
Missão 03 acrescenta a action recall_context e metadados JSON de notas/foco;
o parser antigo não entende essa action em mensagens ainda pendentes.

Se houver falha de schema, aumento de perdas/duplicações, acesso cruzado ou dados
inconsistentes: conter consumo novamente e preservar banco, jobs e fontes. Registrar
o que ocorreu com identificadores mínimos e sem conteúdo privado desnecessário.

- Preferir correção de release que mantenha os novos contratos e os dados.
- Para voltar o código a uma versão anterior, primeiro inspecionar states/actions
  incompatíveis, versões de fila e mensagens já interpretadas. Retomar código antigo
  somente se não houver trabalho incompatível, ou após plano de normalização
  específico, revisado, testado isoladamente e autorizado. Não fornecer um UPDATE
  global que reconverta sending/delivery_unknown em pendente.
- Manter colunas aditivas no rollback de código; não executar down migration
  destrutiva nem apagar evidências de envio. Retirar funcionalidades novas do consumo
  não exige apagar as memórias pessoais que já existiam.
- Havendo corrupção real, a restauração requer aprovação separada, snapshot conhecido,
  isolamento e reconciliação de efeitos externos ocorridos depois do backup.
  Restaurar banco/Redis não desfaz mensagens já enviadas e pode recriar jobs;
  não retomar envio antes da reconciliação de IDs e versões.

É aceitável manter a entrada durável e os workers contidos enquanto se recupera,
com indisponibilidade comunicada. Não prometer rollback automático sem perda ou
reenvio garantidamente único. Nenhum backup/restauro hospedado foi realizado nesta missão.
