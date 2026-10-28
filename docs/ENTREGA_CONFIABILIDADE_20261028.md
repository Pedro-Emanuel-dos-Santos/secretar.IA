# Entrega local — confiabilidade e observabilidade — 28/10/2026

Escopo aprovado por Pedro após a auditoria: lembretes fora da janela, roteamento,
medição de IA e cenários de falha. Nenhuma publicação, configuração remota,
mensagem real ou chamada real a provedores foi executada nesta implementação.

## Comportamento entregue

**Templates.** Antes de enviar fora da janela, consulta metadados na Meta e exige
nome/idioma exatos, status APPROVED, categoria UTILITY e corpo com um parâmetro
posicional. Layouts com headers/buttons ou parâmetros nomeados não são suportados
por este fluxo. A flag local de aprovação sozinha não autoriza envio.

A consulta usa WABA configurada em WHATSAPP_BUSINESS_ACCOUNT_ID. Ausência de
configuração ou template incompatível bloqueia o aviso. Falha temporária de
consulta permite retry, pois nenhum POST de mensagem ocorreu. A janela é calculada
com mensagens reais, excluindo plan_step e conteúdo apagado. Se a Meta recusar
texto com 131047, tenta uma única vez o template verificado. Nunca troca para
Hello World ou descarta o conteúdo do lembrete para simular sucesso.

**Falhas e retentativas.** Rejeições HTTP estruturadas de rate limit/throughput
selecionadas (429, 130429, 131056) recebem até três tentativas de despacho no total,
backoff de 30/60 segundos e Retry-After numérico limitado a 15 minutos. Timeout,
resposta ambígua, 5xx no POST ou falha depois de possível aceitação ficam incertos;
não há reenvio automático. Rejeições de template bloqueiam correção automática.

O estado de retry e a nova versão da agenda são gravados com a outbox na mesma
transação. O relay existente recupera após reinício e usa novo job ID por versão;
job antigo não envia. Cancelar, reagendar, corrigir título, cancelar compromisso
ou desativar resumo respeita o estado de retry. Reagendar explicitamente inicia
novo orçamento de tentativas. Mantém a tolerância de atraso configurada.

Estados novos: delivery_retry, retry_exhausted e blocked_configuration.
Estes aparecem no panorama operacional. Bloqueios por configuração/template não
reativam avisos antigos sozinhos depois que uma configuração for corrigida.

**IA.** OpenAI é o padrão no código e no exemplo de ambiente. AI_MODE explícito
continua sendo respeitado; nenhuma variável privada foi editada. Em hybrid opt-in,
a decisão usa currentMessage e tarefa atual, não o volume do histórico serializado.
Sem endpoint Ollama explícito, vai diretamente à OpenAI. Reasoning/planejamento
e pedidos longos vão à OpenAI; pedidos simples podem usar o local configurado.
Modo ollama não ganha fallback pago silencioso. Consentimentos continuam intactos.

**Medição.** AiUsage recebe motivo de rota, fallback, lista de tentativas com
provedor/modelo solicitado e retornado quando conhecido, tokens, latência e
resultado. Falha dos dois provedores preserva ambas as tentativas. JSON inválido
mantém uso conhecido sem disparar outro provedor escondido. Nenhum prompt,
resposta privada, chave ou texto bruto de erro integra esses metadados.

Há estimativa USD para gpt-4.1-mini e snapshot 2025-04-14, tabela versionada
`openai-standard-text-2026-10-28`: entrada 0,40, cache 0,10, saída 1,60 por milhão
de tokens, conforme [fonte oficial consultada](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
Cache é descontado da entrada, não somado duas vezes. Modelo/token/cache ausente
fica desconhecido, sem inventar zero. A estimativa cobre texto padrão da OpenAI;
exclui Ollama/infraestrutura, áudio, Meta, ferramentas, impostos, câmbio e tarifas
de outros níveis de serviço. Não é fatura nem teto financeiro.

`/operations`, protegido pelo token administrativo existente, inclui agregados
das últimas 24h por conta, provedor, modelo, rota, resultado e fallback: contagem,
tokens conhecidos, custo conhecido e latência média. Não é p95 nem latência total
do WhatsApp. Dados antigos sem medição continuam nulos.

## Migração e preparação para publicação futura

Migração aditiva `20261028180000_reliable_delivery_ai_usage`: dois campos em
Reminder e seis em AiUsage. Foi aplicada somente em secretaria_inbox_test local;
cliente Prisma regenerado. Workers novos aguardam os campos antes de consumir.

Antes de publicar, mediante autorização:

1. Conferir backup/recuperação e planejar rollout coordenado dos workers. Workers
   antigos não conhecem delivery_retry; não manter consumidores antigos e novos
   disputando essa fila durante a ativação. Conter consumo durante a transição,
   preservando PostgreSQL/Redis, e verificar as três versões antes de retomar.
2. Executar a migração da API e publicar o mesmo código nos três serviços.
3. Confirmar AI_MODE=openai explicitamente no inbox; não mudar modelo sem avaliação.
4. Configurar WABA, nome, idioma e flag somente para um template realmente aprovado
   e compatível, com credencial capaz de ler seus metadados. WABA e número precisam
   corresponder. Leitura de template requer permissões além do envio em alguns tokens.
5. Rodar o probe compilado `node scripts/check-whatsapp-template.cjs --allow-meta-read`
   com credenciais atuais. Ele só consulta metadados e não imprime chaves/corpo.
6. Validar uma entrega real fora da janela com autorização do destinatário e
   conferir aceitação/recibo, além das métricas operacionais.

## Limitações e riscos restantes

- O template real, permissões e Graph API configurada não foram consultados neste
  pacote: toda interação HTTP de teste foi simulada. As páginas oficiais Meta
  tentadas retornaram HTTP 429 nesta sessão; validar política/códigos e layout na
  conta antes de habilitar o envio. URLs de referência: [erros](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/)
  e [templates](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/).
- Receber ID/aceitação não comprova chegada ao telefone. Falha posterior em webhook
  é registrada; este pacote não reenvia automaticamente mensagens já aceitas.
- Falha ao persistir resultado após possível envio continua exigindo reconciliação.
  Não prometer exactly-once externo. Nenhuma restauração de produção foi ensaiada.
- Heurística de intenção é determinística e limitada; não é um classificador
  universal. Qualidade conversacional e custo/latência reais continuam pendentes.
- Preços são um snapshot para texto padrão dos modelos listados; revisar tabela
  quando modelo/tarifa mudar. Nenhum limite financeiro foi ativado.
- Testes de banco/fila usam PostgreSQL local e transporte/filas/provedores simulados;
  não comprovam aprovação Meta, latência real ou rollout misto de versões.

## Evidências

Validação final: TypeScript sem emissão, build de produção, **270 unitários e
316 integrações aprovados**, zero falhas. A suíte inclui 13 unitários novos e
10 integrações novas. Probe de metadados executado sem flag confirmou que não
faz chamadas por padrão. `git diff --check` passou. Links locais de documentação
verificados separadamente antes do commit.

Logs no workspace Codex, pasta `work`: `beta-reliability-final.log` (suíte
completa final), `beta-reliability-target.log` (etapa específica anterior, nove
casos), `beta-reliability-unit.log` (270 unitários da primeira etapa válida).
Os dez casos atuais de integração fazem parte da suíte completa final.

Primeira execução unitária esbarrou no import do cliente global sem DATABASE_URL; transporte
foi separado para permitir injeção e testes sem banco. Teste de cancelamento expôs
ordem incorreta de verificação do retry e foi corrigido. Nenhuma falha foi tratada
como sucesso. Não houve alteração em Toolkit ou FreeLLMAPI.

## Arquivos alterados nesta entrega

- [backend/.env.example](../backend/.env.example)
- [backend/NEXT-SESSION.md](../backend/NEXT-SESSION.md)
- [backend/prisma/migrations/20261028180000_reliable_delivery_ai_usage/migration.sql](../backend/prisma/migrations/20261028180000_reliable_delivery_ai_usage/migration.sql)
- [backend/prisma/schema.prisma](../backend/prisma/schema.prisma)
- [backend/scripts/check-whatsapp-template.cjs](../backend/scripts/check-whatsapp-template.cjs)
- [backend/src/ai/ai-router.ts](../backend/src/ai/ai-router.ts)
- [backend/src/ai/ollama.provider.ts](../backend/src/ai/ollama.provider.ts)
- [backend/src/ai/types.ts](../backend/src/ai/types.ts)
- [backend/src/domain/ai.cost.ts](../backend/src/domain/ai.cost.ts)
- [backend/src/domain/ai.operations.ts](../backend/src/domain/ai.operations.ts)
- [backend/src/domain/ai.usage.ts](../backend/src/domain/ai.usage.ts)
- [backend/src/domain/appointments.ts](../backend/src/domain/appointments.ts)
- [backend/src/domain/inbox.processor.ts](../backend/src/domain/inbox.processor.ts)
- [backend/src/domain/operations.overview.ts](../backend/src/domain/operations.overview.ts)
- [backend/src/domain/preferences.ts](../backend/src/domain/preferences.ts)
- [backend/src/domain/preflight.ts](../backend/src/domain/preflight.ts)
- [backend/src/domain/reminder.delivery.ts](../backend/src/domain/reminder.delivery.ts)
- [backend/src/domain/reminder.execution.ts](../backend/src/domain/reminder.execution.ts)
- [backend/src/domain/reminder.management.ts](../backend/src/domain/reminder.management.ts)
- [backend/src/domain/whatsapp.errors.ts](../backend/src/domain/whatsapp.errors.ts)
- [backend/src/domain/whatsapp.policy.ts](../backend/src/domain/whatsapp.policy.ts)
- [backend/src/http/operations.handlers.ts](../backend/src/http/operations.handlers.ts)
- [backend/src/inbox-worker.ts](../backend/src/inbox-worker.ts)
- [backend/src/queue/reminder.worker.ts](../backend/src/queue/reminder.worker.ts)
- [backend/src/services/ai.service.ts](../backend/src/services/ai.service.ts)
- [backend/src/services/whatsapp-template.service.ts](../backend/src/services/whatsapp-template.service.ts)
- [backend/src/services/whatsapp.sender.ts](../backend/src/services/whatsapp.sender.ts)
- [backend/src/services/whatsapp.service.ts](../backend/src/services/whatsapp.service.ts)
- [backend/test/ai-routing.test.cjs](../backend/test/ai-routing.test.cjs)
- [backend/test/integration.cjs](../backend/test/integration.cjs)
- [backend/test/reliability-beta.integration.cjs](../backend/test/reliability-beta.integration.cjs)
- [backend/test/run.cjs](../backend/test/run.cjs)
- [backend/test/whatsapp-template.test.cjs](../backend/test/whatsapp-template.test.cjs)
- [docs/DECISOES_TECNICAS.md](../docs/DECISOES_TECNICAS.md)
- [docs/ENTREGA_CONFIABILIDADE_20261028.md](../docs/ENTREGA_CONFIABILIDADE_20261028.md)
- [docs/README.md](../docs/README.md)
