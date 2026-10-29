# Publicação coordenada M04 — plano não executado

**Estado atual: NO-GO.** Ler [relatório](MISSAO_04_GO_NO_GO.md). Autorização desta
missão cobre preparação/testes locais e GitHub dev; não cobre nenhuma operação
de produção descrita aqui. Não executar este documento automaticamente.

## P0 — antes de tocar no ambiente

Identificar SHA candidato com as correções M04, resultados dos checks desse SHA,
três serviços e deployments atuais. Conferir fonte/build/start/pre-deploy reais,
Node 24 e dependências. Não avançar `codex/railway-ready-20261020` agora.

**Parar** sem backup real recuperável, RPO/RTO escolhidos, destino isolado privado
para restauração e autorização específica. Criar backup/snapshot/agenda requer
nova ação aprovada. A ausência atual está comprovada; não marcar “backup OK” por
existir volume, `pg_dump` fictício ou bgsave Redis.

Preparar template/configuração e credenciais atuais conforme relatório. Revisar
os dois apps inscritos e o webhook. Definir janela com indisponibilidade e suporte.
Backlog e configurações devem ser recolhidos novamente no momento da publicação.

## P1 — conter entrada e consumo, depois esvaziar operações em curso

Somente após autorização para interrupção, alterações e retomada:

1. Pausar **globalmente** a fila BullMQ `reminders`, sem remover jobs; `Queue.pause()`
   impede novos claims e permite terminar ativos. Foi ensaiado localmente.
   [Semântica oficial BullMQ](https://docs.bullmq.io/guide/workers/pausing-queues).
2. Remover o deployment ativo da **API** pelo menu Deployments → Remove, mantendo
   serviço, domínio, volumes e configuração. Meta recebe indisponibilidade e deve
   reentregar; a identidade de entrada deduplica o que já foi persistido.
3. Aguardar escoamento dos requests já aceitos e interpretação/execução do inbox.
   Parar se houver lease em andamento, `sending`/`delivery_unknown` novo ou falha
   sem classificação. Não transformar estado incerto em pendente.
4. Com entrada contida e fila pausada, confirmar active=0 e nenhuma operação externa
   em andamento. Remover deployments ativos de inbox e lembretes. Conferir
   teardown de **todas** as réplicas/deployments; não basta iniciar uma versão nova.

Remove interrompe um deployment; a configuração de draining controla a janela
antes de término forçado. O padrão pode ser zero. Não contar com shutdown de 30s
do código sem conferir o tempo concedido pela plataforma.
[Referência oficial Railway](https://docs.railway.com/deployments/reference).

Código de referência para a pausa, **não executado em produção nesta missão**,
rodando na sessão correta com o Redis já configurado (nenhuma URL no comando):

```javascript
const {Queue}=require('bullmq');
const {redisConnection}=require('./dist/config/redis');
const q=new Queue('reminders',{connection:redisConnection});
await q.pause(); // operação mutante: exige autorização
await q.close();
```

Não usar `pause()` somente num Worker local achando que parou os demais. Não
apagar a fila, usar FLUSHDB, excluir serviços ou tocar nos volumes para conter.

## P2 — snapshot consistente e build com consumidores inertes

1. Com as aplicações paradas, fazer/reconfirmar backup consistente de PostgreSQL
   e Redis e guardar manifestos/identificadores em local privado. Conferir que
   backups existem e são restauráveis. **Parar** em qualquer falha desse gate.
2. Preparar, em mudança autorizada, startCommand temporário de **ambos os workers**:
   `node -e "setInterval(()=>{},1000)"`. Esse processo não importa a aplicação,
   não acessa banco e não consome fila. Não alterar o start da API para esse valor.
   Preparar draining >=30s e overlap compatível com a janela; configuração não
   representa processo já atualizado até ser aplicada/conferida.
3. Só então publicar o SHA aprovado na fonte de produção, numa ação autorizada.
   O push nessa branch pode disparar os três builds: por isso os workers têm de
   subir **inertes** e a fila continuar pausada. Confirmar que nenhum consumidor
   antigo ficou vivo e que nenhum build de outro SHA entrou na janela.
4. API aplica somente `20261028180000_reliable_delivery_ai_usage` no pre-deploy.
   Verificar `_prisma_migrations`, oito colunas/defaults, logs e readiness.
   Aguardar API saudável; os workers ainda não processam nada. Nova entrada pode
   ser persistida pela API, mas aguarda consumo.

**Parar** se pre-deploy falhar, schema não conferir, backup deixar de ser
recuperável, versões divergirem ou aparecer consumidor inesperado. Não executar
normalização global de estados para “fazer funcionar”. Não executar migração manual
em paralelo à migração do pre-deploy.

## P3 — liberar a mesma release em etapas

1. Confirmar SHA **igual** nos três artefatos, configurações mínimas por serviço,
   modelo/consentimentos, template real e permissões de cada credencial.
2. Restaurar startCommand `node dist/inbox-worker.js` e reiniciar/republicar somente
   esse artefato novo, com alteração autorizada. Verificar gate de schema e
   processamento observado. Esta etapa pode responder mensagens reais pendentes;
   deve estar incluída no escopo de autorização.
3. Restaurar startCommand `node dist/queue/reminder.worker.js`, conferir todas as
   réplicas novas e logs de schema. A fila permanece globalmente pausada.
4. Conferir atrasos, estados incertos e jobs vencidos; não reativar avisos antigos
   nem alterar REMINDER_MAX_LATENESS para esconder atraso. Só após autorização de
   retomada, `Queue.resume()` libera claims dos novos consumidores.
5. Observar inbox/outboxes, claims, versões, uso IA, retries, erros e recibos. Fazer
   jornadas autorizadas com Pedro; a prova de template exige entrega fora da janela,
   não Hello World nem apenas HTTP 200. **Não convidar participante antes do gate.**

Readiness não prova qualidade da IA ou entrega da Meta. Contagens zero precisam
ser do momento, não o snapshot de leitura desta missão.

## Recuperação: dois momentos diferentes

**Antes de consumidores novos operarem:** manter fila pausada e remover API nova
se necessário. Inspecionar migração e dados; a alteração é aditiva. Se nenhum
state/action novo tiver sido escrito e os contratos/backlog conferirem, poderá
ser autorizada retomada dos artefatos antigos. Manter colunas adicionais; não
executar down migration. Reaplicar comandos/variáveis conhecidos e seguros,
sem restaurar por engano credenciais anteriores à rotação.

**Depois de consumidores novos operarem:** conter novamente. Código `a072f63`
ignora `delivery_retry` e rejeita `recall_context`, comprovado no ensaio com o
source histórico. Não fazer rollback cego para ele, mesmo que o schema seja aditivo.
Preferir correção que preserve contratos. Voltar para versão antiga exige inventário
de states/actions, aprovação e plano específico para cada incompatibilidade.

**Se dados estiverem corrompidos:** preservar evidências e conter aplicações.
Restauração real exige autorização separada, snapshot conhecido e destino isolado
primeiro. Conferir consistência PostgreSQL/Redis e efeitos externos desde o backup.
Mensagem já enviada não é desfeita por restore; reaparecimento de job não autoriza
reenviar. Casos `sending`/`delivery_unknown` permanecem sob reconciliação, sem reset
automático de status, versões, leases ou provider IDs.

Aceitar indisponibilidade controlada é mais seguro que reativar consumidores
incompatíveis ou prometer recuperação sem perda/duplicação ainda não demonstrada.
