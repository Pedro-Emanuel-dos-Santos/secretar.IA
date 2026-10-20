# Secretár.IA — operação e próximo deploy

Atualizado em 20/10/2026. Código preparado; este documento não comprova publicação em nuvem.

## Funcionamento local

O arquivo privado de configuração deste computador está na raiz do repositório, em `.env`.
Na pasta `backend`, execute os processos separadamente:

```powershell
node --env-file=../.env dist/server.js
node --env-file=../.env dist/inbox-worker.js
node --env-file=../.env dist/queue/reminder.worker.js
```

PostgreSQL e Redis: `docker compose up -d postgres redis`.
Após mudanças: pare os três processos, gere o cliente (`node --env-file=../.env node_modules/prisma/build/index.js generate`), aplique migrações após backup, compile (`node node_modules/typescript/bin/tsc`) e reinicie. No Windows o engine Prisma pode estar bloqueado pelos processos em execução.

## Lembretes e reagendamento

Criar, listar, cancelar, concluir e reagendar são ações estruturadas. Exemplos: "quais lembretes tenho?", "cancela o lembrete da água", "concluí o da água", "adia o lembrete da água para amanhã às 10h".
O alvo deve pertencer à pessoa e ao número comercial. Ambiguidade pede esclarecimento.
Reagendar incrementa `scheduleVersion` no mesmo lembrete e reinicia sua outbox em uma transação. Cada versão recebe um job diferente; jobs antigos são recusados mesmo se continuarem no Redis. Avisos em envio ou com resultado incerto não são reagendados automaticamente. A resposta diz quando a publicação ainda está pendente; não promete um agendamento já confirmado.
Datas relativas simples usam o recebimento, sem deslocar o fuso. Recorrência e edição do título continuam pendentes. Referências curtas ainda dependem do contexto limitado; não existe estado formal de esclarecimento.

## WhatsApp após 24 horas

Texto livre usa a última mensagem de texto recebida da pessoa para esse número comercial, com margem de um minuto antes de expirar. Sem entrada conhecida ou fora da janela, lembretes exigem um modelo aprovado. Respostas comuns atrasadas são bloqueadas.
O rascunho revisável está em `templates/secretaria_lembrete_v1.json`. Não foi enviado para aprovação. Os templates de demonstração existentes não foram reutilizados para uma finalidade diferente.
Após aprovação real do nome/idioma/corpo e revisão do custo, configure no ambiente privado:

```dotenv
WHATSAPP_REMINDER_TEMPLATE_NAME=secretaria_lembrete_v1
WHATSAPP_REMINDER_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_REMINDER_TEMPLATE_APPROVED=true
```

O corpo aprovado deve conter exatamente uma variável de texto para o lembrete. Aprovação/categoria e cobrança são decisões da Meta; não há garantia de aprovação ou gratuidade. Sem configuração, o lembrete fica `blocked_template`, sem requisição de envio e sem reenvio automático. Pode ser cancelado ou reagendado. Respostas bloqueadas ficam `blocked_window` / `reply_blocked`. Investigue antes de retomar pendências; nunca redefina estados de envio incerto.
Usar o número de teste ainda exige destinatários autorizados. `WHATSAPP_RECIPIENT_MAP` é um mapa explícito dos aliases de envio; não altera a identidade da conversa nem aplica regra universal de nono dígito.

Política consultada: https://business.whatsapp.com/policy/preview?lang=pt_BR

## Entrega e operação

`status=provider_accepted` registra aceitação do envio. `deliveryStatus` guarda sent/delivered/read/failed, e `deliveryErrorCodes` contém somente códigos. Recibos atrasados não regridem leitura/entrega para envio/falha. Os eventos originais mínimos continuam preservados. Recibos que chegam antes da resposta HTTP são reconciliados após gravar o ID do provedor.
GET `/operations` exige `ADMIN_API_TOKEN` e mostra contagens, falhas, bloqueios de template e estados de entrega sem textos ou telefones. Execute `node --env-file=../.env scripts/operations.cjs`.
GET `/health/live` informa que a API responde. GET `/health/ready` confere acesso a PostgreSQL/Redis. Esses endpoints não provam que os workers estão avançando; acompanhe também o resumo operacional e o teste ponta a ponta. Não há alerta externo automático nesta entrega.

## Backup e restauração

Antes de migrações, use `pg_dump -Fc` para um arquivo privado. Em Windows, prefira criar o dump dentro do contêiner e usar `docker cp`; isso evita corromper o binário com redirecionamento de texto.
Restaure primeiro em um banco novo e isolado, confira contagens e migrações e só então considere a cópia utilizável. Nunca use `pg_restore --clean` no banco ativo como teste. Backup no mesmo computador não protege contra perda do disco; falta definir cópia externa criptografada, retenção e agendamento quando escolhermos a hospedagem.
Nesta rodada foi gerado um dump e testada a restauração em `secretaria_restore_test`, antes da migração aditiva. O banco de integrações é `secretaria_inbox_test` e nunca é o banco pessoal.

## Hospedagem: Railway e Vercel

O usuário indicou uma conta paga possivelmente Railway; o provedor ainda precisa ser confirmado.
A opção que preserva o backend atual é Railway com API, worker de entrada, worker de lembretes, PostgreSQL e Redis no mesmo projeto. Vercel pode hospedar o futuro site/painel. Não é preciso hospedar o mesmo webhook nos dois lugares.

Na Railway, prepare os três serviços do mesmo repositório, com Root Directory `backend`:

| Serviço | Configuração | Comando |
|---|---|---|
| API | `/backend/railway.json` | `node dist/server.js` |
| Entrada | `/backend/railway.inbox.json` | `node dist/inbox-worker.js` |
| Lembretes | `/backend/railway.reminders.json` | `node dist/queue/reminder.worker.js` |

Se o seletor de configuração/root resolver caminhos de outra forma, confira o log de build e as configurações efetivas antes de publicar. Somente API usa healthcheck HTTP e pre-deploy de migração. Publique API/migração antes dos workers; mantenha um único worker de entrada inicialmente. A porta é lida de `PORT`.
Configure referências privadas de `DATABASE_URL` e `REDIS_URL` dos serviços gerenciados e os segredos do app. Redis precisa de conexão TCP compatível com ioredis/BullMQ; uma URL REST isolada não basta. `rediss://` ativa TLS com verificação de certificado padrão. Banco remoto requer limites de conexão adequados; use endereço direto para migrações se o provedor exigir.
O Dockerfile executa como usuário não root e não inclui `.env`, dumps ou logs. `compose.production.yml` é uma alternativa para servidor próprio, com volumes persistentes e PostgreSQL/Redis sem portas públicas; não é uma instalação automática na Railway.
Na Railway, limite gastos e confirme backup dos volumes/banco. Criar serviços pode gerar cobrança; nenhum serviço pago foi criado por esta implementação.

A API também ganhou export padrão Express e `vercel.json` para uma eventual escolha de webhook na Vercel. Os workers de loop contínuo não devem ser iniciados dentro de Functions. Vercel oferece Queues/Workflow, mas adotá-los exige redesenhar e testar a execução durável; não é uma troca de hospedagem transparente.

Fontes oficiais:
- https://vercel.com/docs/frameworks/backend/express
- https://vercel.com/docs/functions/runtimes
- https://vercel.com/docs/queues
- https://docs.railway.com/

## Critério antes de publicar

Confirmar provedor, projeto, região, preços/limite de gastos e variáveis privadas. Fazer backup e aplicar migração na instância escolhida. Validar liveness/readiness e progressão dos workers. Alterar callback somente após o endereço HTTPS estar ativo. Testar pelo próprio destinatário autorizado: criar, listar, adiar antes do disparo, cancelar, concluir, e um aviso real fora de 24 horas com template aprovado. Validar receipt ou confirmação no celular, sem tratar HTTP 200 como entrega.
Não há frontend, cadastro de assinantes, cobrança, áudio, recorrência ou piloto público nesta entrega.

## Validação e pendências desta entrega

Build TypeScript passou. Após as atualizações compatíveis de dependências, passaram 73 testes unitários/HTTP e 67 integrações em PostgreSQL isolado.
No teste real controlado pelo operador, a IA escolheu reschedule_reminder e o alvo correto. O job antigo foi promovido para provar a recusa por versão; o novo horário disparou e recebeu delivered. Jobs cancelado/concluído não enviaram. Esse teste foi iniciado pela API interna e pelo pipeline de interpretação; ainda falta repetir as novas ações por uma mensagem real enviada pelo usuário ao WhatsApp.

A auditoria corrigiu os alertas HTTP compatíveis, incluindo proxy-addr. Em seguida, Prisma/Client/adapter-pg foram atualizados para 7.10.1 após validação isolada: compilação, 73 testes unitários/HTTP, 67 integrações e status das migrações passaram. A auditoria da atualização retornou zero vulnerabilidades conhecidas. Não foi usado audit fix --force. O pool PostgreSQL usa cinco conexões por cliente, timeout de conexão de cinco segundos e TLS padrão do driver; a URL de migração pode ser separada por DIRECT_DATABASE_URL.

O cliente ainda usa o gerador prisma-client-js compatível com CommonJS; ele segue suportado em Prisma 7, mas a documentação anuncia sua remoção futura. A mudança futura de gerador deve ser tratada e testada separadamente. A URL da CLI agora fica em prisma.config.cjs; a aplicação usa o adaptador PostgreSQL em src/config/database.ts. Essa atualização não exigiu alteração de tabelas ou dados.

O primeiro Dockerfile chegou a compilar em Linux, mas sua exportação foi interrompida por falta de memória e queda do Docker. Depois da atualização Prisma 7, todas as etapas da imagem final passaram com buildx em modo cacheonly, incluindo geração do cliente, compilação e instalação de produção com zero vulnerabilidades conhecidas. Esse modo evita carregar/exportar a imagem pesada no computador; o contêiner de produção e o compose ainda precisam de um teste de subida antes de direcionar tráfego público. Não foram criados serviços pagos, enviado template para aprovação nem alterado callback público nesta preparação. Confirme o histórico Git local para saber se a versão já foi commitada; não houve push desta preparação.
