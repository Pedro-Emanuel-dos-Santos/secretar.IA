# Missão 04 — prontidão operacional e validação integrada

28/10/2026, America/Sao_Paulo. Horários UTC completos estão na evidência; uma
coleta às 02h UTC de 29/10 ainda corresponde à noite de 28/10 no fuso do projeto.

**NO-GO para produção e primeiro participante. GO para continuar em ambiente
isolado.** Há evidência integrada relevante, mas os volumes reais não têm backups
e falta um template de lembrete compatível/aprovado/configurado. Nenhum deploy,
migração remota, callback, credencial ou registro real foi alterado; nenhum WhatsApp
real foi enviado. A publicação desta missão é só na branch de desenvolvimento.

Base revisada: `e920084`, `f9db473`, `2772da2`.
[Evidência estruturada](evidence/m04-operational-readiness-20261028.json) inclui
contextos fictícios, respostas OpenAI, resultados persistidos, contagens,
permissões, migração/contratos e ensaio de restauração.

## 1. Revisão de regressões: três problemas encontrados e corrigidos

| Gravidade | Problema reproduzido | Correção e evidência |
|---|---|---|
| Crítica | Recuperação lexical de tarefa sobrescrevia o `OR` de `reminderScope`. Um mesmo telefone podia recuperar tarefa de outra conta comercial. | Compor escopo e busca em `AND`, preservando ambos os filtros. Regressão com mesma pessoa/conta diferente, inclusive tarefa vinculada a projeto. Reprodução foi no código de desenvolvimento, não evidência de vazamento em produção. |
| Alta | Após excluir nota criada por plano composto, a proposta e a confirmação recentes ainda reenviavam seu texto no histórico apresentado à IA. | Omitir histórico bruto de criação/confirmacão/descarte de planos; estado estruturado do plano atual continua disponível. Teste cria, confirma, exclui e verifica ausência do texto no contexto inteiro. |
| Média | Compromisso e seu próprio aviso eram contados como dois alvos nomeados, rejeitando correção com título explícito. | Desconsiderar somente avisos cujos IDs pertencem ao compromisso atual. Tarefa independente de mesmo título continua ambígua. Mesma resposta OpenAI foi reaplicada ao mesmo contexto fictício, sem nova cobrança, e o registro correto mudou de horário. |

**Não publicar `2772da2` sozinho como release do beta.** A release candidata deve
incluir estas correções e seus testes. Nenhuma nova migração foi criada na M04.
O processamento do job foi extraído para `createReminderProcessor`, usado tanto
pelo worker real como pelo ensaio BullMQ; não se substituiu o domínio por um fake.

## 2. Estado real da Railway — somente leitura

Os metadados dos três deployments confirmam o mesmo SHA completo:
`a072f63353961ea6da0c5756417967a91248a317`, branch `codex/railway-ready-20261020`.

| Serviço | Deployment ativo | Situação |
|---|---|---|
| API | `6ab19165-f02d-454a-b181-729dd5de3cd7` | SUCCESS, uma réplica |
| Inbox | `1150569b-927b-472d-b64b-94a65e508c32` | SUCCESS, uma réplica |
| Lembretes | `614ab584-6b70-4083-81d6-f0fb781dba11` | SUCCESS, uma réplica |

Cinco serviços online, nenhum rollout/configuração staged, nenhuma falha recente
reportada pelo conector. PostgreSQL **18.6**, Redis **8.2** hospedados. Banco e
Redis sem proxy TCP público. API usa RAILPACK, raiz `/backend`, readiness
`/health/ready`, migração no pre-deploy; workers usam comandos compilados.
`checkSuites:false`: não presumir que o push execute ou exija testes como gate remoto.

Inventário coletado em transação PostgreSQL com `transaction_read_only=on`:

| Recurso | Estado contado |
|---|---|
| Entradas | 23 `completed` |
| Respostas | 23 `provider_accepted` — aceitação não equivale a recibo de entrega |
| Outbox de agenda | 5 `cancelled`, 3 `published` |
| Lembretes históricos | 4 `provider_accepted`, 3 `scheduled`, 1 `blocked_template` |
| Operações interpretando/executando / leases vencidos | 0 / 0 |
| Respostas e lembretes `sending`/`delivery_unknown` | 0 / 0 |
| Lembretes **ativos** pendentes / vencidos pendentes | 0 / 0 |
| Interpretações novas incompatíveis pendentes | 0 |

Os três `scheduled` históricos não são três avisos ativos pendentes; o inventário
separa ciclo de vida e estado de entrega. Não reativamos nem normalizamos nenhum.
Redis `bull:reminders`: wait/active/paused/delayed/prioritized/waiting-children = 0,
completed = 7, failed = 1. Há um bloqueio histórico de template a reconciliar; não
reenviar automaticamente o job falho só para limpar o painel.

Produção tem 17 migrações aplicadas; a de confiabilidade
`20261028180000_reliable_delivery_ai_usage` está ausente, assim como suas oito
colunas novas. Isso é coerente com a versão publicada. Nenhuma foi aplicada aqui.

## 3. Backups reais e ensaio local são evidências diferentes

As telas oficiais de **Postgres e Redis** informam: “No Backups”. O plano permite
consultar/restaurar backups existentes, mas restringe criar snapshots, agendas e
PITR ao Pro. Não havia backup hospedado para verificar checksum, idade, retenção
ou restauração. Nenhum upgrade ou backup remoto foi criado.

Redis real: RDB com `save 60 1`, último bgsave informado `ok`, **AOF desativado**.
Persistência no volume e bgsave não substituem backup independente nem demonstram
recuperação de perda/corrupção do volume. RPO/RTO reais continuam **não definidos
e não demonstrados**. [Referência oficial de backups](https://docs.railway.com/volumes/backups).

Ensaio exclusivamente fictício, com imagens fixadas por digest:

- PostgreSQL **18.6** em `127.0.0.1:5435`, banco `secretaria_m04_test`.
  `pg_dump` custom foi restaurado em um banco novo `_test` na mesma versão.
  Contagem e SHA-256 dos dados de **13 tabelas** coincidiram integralmente.
  Hash e tamanho do arquivo e manifestos por tabela estão no JSON.
- Arquivo truncado foi restaurado em **outro** banco descartável usando
  `--single-transaction --exit-on-error`: falhou e não deixou tabelas parciais.
- Redis **8.2.11** em `127.0.0.1:6381`, DB 15: pausa global impediu consumo e
  retomada processou uma vez. Após snapshot/SAVE, `SIGKILL` e nova partida,
  valores lógicos persistentes conferiram. O RDB passou `redis-check-rdb` e foi
  restaurado em outro contêiner **sem rede**, com o mesmo digest lógico.
- O Redis de teste tem AOF; o real não. A restauração independente do **RDB** também
  foi exercitada, mas não prova ausência de perda no Redis real. Metadados com TTL
  foram excluídos da comparação; listas, hashes, streams, ordem e scores foram incluídos.

Esse ensaio demonstra o procedimento com fixtures, **não recuperabilidade de
dados reais da Railway**. Os arquivos binários fictícios ficam no diretório local
de evidências, fora do Git; no Git estão manifestos, hashes e resultados.

## 4. Jornadas integradas e prova persistida

Foi usado o router HTTP real de webhook com HMAC, `IncomingMessage`, builder de
contexto/recuperação, parser/guardas, inbox processor, transações, outboxes,
BullMQ/Redis real, processador compartilhado de job e remetente real com transporte
HTTP simulado. O `fetch` global do harness bloqueia rede externa. Apenas chamadas
loopback de entrada e callbacks de transporte fake são usados nele.

As duas interpretações OpenAI foram novas e usaram contextos extraídos do banco
fictício. Por a credencial atual estar no ambiente autenticado e a chave local ser
antiga, o transporte do modelo foi feito em **checkpoints**: contexto e prompt
identificados por SHA-256 → inferência real com chave usada internamente → resposta
vinculada ao mesmo hash → retomada local com contexto revalidado (somente
`processingAt` pode variar). Nenhuma interpretação foi inventada para substituir
essas duas respostas. **Não foi uma execução hospedada contínua, sem intervenção,
do RPC OpenAI dentro do worker.** Isso continua uma prova de integração remota pendente.

| Jornada | Verificação de estado e efeitos |
|---|---|
| Entrada | HMAC inválido retorna 401 e não cria linha; válido persiste; provider ID repetido não duplica. |
| Consentimento | Explicação enviada pelo transporte fake, aceite por nova entrada, evento de consentimento e memória com origem. |
| Contexto entre sessões | Fonte envelhecida 12 dias, criação anterior fora do histórico curto; nova consulta recupera memória por conceito, com origem. |
| Plano com OpenAI | Proposta tem nota + lembrete; **zero criações antes de confirmar**; confirmação aplica as duas partes e reentrega não duplica. |
| Referência ambígua | Entrevista, nota e tarefa relacionadas não escolhem foco automaticamente. Uma interpretação de alteração adivinhada foi bloqueada sem mudar versão. |
| Correção com OpenAI | Mesmo appointment ID, mesmo dia, uma hora de duração, 16h America/Sao_Paulo = 19Z, versão incrementada. Aviso antigo cancelado e novo preserva antecedência. |
| Recusa de armazenamento | Modelo fake sugere `save_note`; guarda converte em conversa e quantidade de notas não aumenta. |
| Revogação e exclusão | Memória sai do contexto após revogar; memória/nota removidas não reaparecem pela recuperação ou histórico de planos. |
| Isolamento | Outra pessoa e mesma pessoa em outra conta não recebem registros do contato/conta original. |
| Interrupção no inbox | Outra conexão retoma interpretação já persistida sem IA; exatamente um lembrete e uma resposta. |
| ACK perdido da fila | Redis aceita `add`, transporte simula perda do ACK; outbox é retomada por nova conexão e job ID estável impede duplicação. |
| Worker real | Job de versão/aviso antigo é descartado; jobs atuais usam domínio real de claim/envio/persistência. |
| Recusa temporária | Código 130429 cria `delivery_retry` e nova versão/outbox; próxima tentativa aceita, contador = 2. |
| Incerteza | Falha após possível efeito externo deixa `delivery_unknown`; repetir processamento não produz outro envio. Resposta incerta também não é reenviada. |
| Template e recibos simulados | Payload fora da janela usa template com um parâmetro; `provider_accepted` não vira `delivered` sem recibo. POST assinado de status persiste recibos. |

**O modelo errou um instante bruto:** respondeu `19:00-03:00` ao pedido de 16h.
A resposta parecia coerente em português, mas o instante era errado. A normalização
determinística usou a hora explícita do usuário e o dia do registro e gravou
`19:00Z`, correto. Não classificamos a interpretação temporal bruta como aprovada;
o resultado correto comprovado é o do sistema após guardas e persistência.

Relógio fictício em junho de 2099 e promoção controlada de jobs delayed permitiram
exercitar disparos sem esperar. Isso não demonstra uma entrega WhatsApp real após
24h nem mede a latência total do ambiente hospedado. Latências originais das duas
chamadas estão no JSON; `AiUsage.elapsedMs` da retomada mede o transporte local de
replay e não deve ser apresentado como latência da API OpenAI.

## 5. Uso OpenAI e verificações

| Chamada desta missão | Modelo observado | Entrada / saída | USD estimados |
|---|---|---|---|
| Plano com contexto do banco | gpt-4.1-mini-2025-04-14 | 10.622 / 91 | 0,0043944 |
| Correção com contexto do banco | gpt-4.1-mini-2025-04-14 | 11.434 / 77 | 0,0046968 |
| Total M04 | 2 chamadas | 22.056 / 168 | **0,0090912** |

Acumulado M03 + M04: **19 chamadas, US$ 0,0744716 de US$ 0,10**, sem uso
desconhecido; saldo US$ 0,0255284. Nenhuma nova rodada paga foi feita para repetir
a correção do código. Preços versionados conforme
[documentação oficial](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
Estimativa, não fatura. Novas chamadas continuam exigindo orçamento vigente.

- **291 unitários aprovados**, incluindo contrato/hash, orçamento acumulado,
  uso desconhecido e trava exclusiva contra chamada paga duplicada.
- **333 integrações aprovadas** no PostgreSQL 18 local, com provedores simulados.
- Typecheck e build aprovados. Após a suíte completa (286 unitários + 333
  integrações), o helper de checkpoint ganhou cinco testes; repetimos os unitários
  e typecheck, sem repetir integrações sem mudança de domínio.
- Jornadas específicas com Redis real e os dois checkpoints OpenAI: aprovadas
  pelos efeitos acima. Ensaio PostgreSQL/Redis e contratos históricos: aprovado.

## 6. Meta — configuração real verificada por GET

Número ID `1384674954731707` pertence à WABA `1128643199613102`: consulta
`phone_numbers` retornou 200 e correspondência positiva. A WABA foi fornecida
anteriormente por Pedro; **não está configurada nos workers**.

Token do inbox consultado retornou `granted` para `business_management`,
`whatsapp_business_management` e `whatsapp_business_messaging`. Listar templates
também retornou 200; não houve POST de mensagem. Isso comprova a leitura com essa
credencial, não que outra credencial de outro serviço tenha os mesmos acessos.

Foram listados cinco templates aprovados, todos **en_US**, sem próxima página:

| Template | Categoria / estrutura | Compatível com lembrete do beta? |
|---|---|---|
| hello_world | UTILITY, header, body sem parâmetro | Não |
| jaspers_market_order_confirmation_v1 | UTILITY, header/buttons, três parâmetros no body | Não |
| Outros três exemplos jaspers_market | MARKETING, estruturas diversas | Não |

O contrato do beta aceita UTILITY/APPROVED, linguagem exata, BODY com parâmetro
posicional `{{1}}`, footer opcional, sem header, buttons ou carousel. Logo nem
“hello_world aprovado” nem a flag sozinha são suficientes.

Falta preparar, **sem criar nesta missão**, por exemplo:

- Nome proposto `secretaria_lembrete_v1`, idioma `pt_BR`, categoria UTILITY,
  formato POSITIONAL, BODY `Olá! Este é o lembrete que você pediu: {{1}}.`.
  Exemplo fictício do parâmetro: `Revisar o portfólio às 10h`. Aprovação e eventual
  recategorização pertencem à Meta; o nome ainda não existe na conta consultada.
- Após aprovação, configurar nos serviços que enviam lembretes:
  `WHATSAPP_BUSINESS_ACCOUNT_ID=1128643199613102`,
  `WHATSAPP_REMINDER_TEMPLATE_NAME`, `WHATSAPP_REMINDER_TEMPLATE_LANGUAGE=pt_BR`
  e `WHATSAPP_REMINDER_TEMPLATE_APPROVED=true`. Confirmar permissões da credencial
  efetivamente usada por cada serviço; não copiar valor antigo ou expô-lo.
- No inbox a flag efetiva observada era falsa; nomes de WABA/template estão
  ausentes no inventário de ambos os workers. A API não precisa receber token de
  envio só para processar webhook. Não expandir credenciais sem necessidade.

O app esperado `1132748059692328` está inscrito na WABA; há também
`2202427980234937`. Conferir finalidade/callback de cada inscrição antes do beta,
sem remover automaticamente nenhuma. Configuração de callback e HMAC reais não
foram alteradas nem comprovadas por mensagem real nesta missão.

Recibos: o código valida conta/contato, deduplica, preserva ordem monotônica e
reconcilia recibo que chegou antes da resposta HTTP. Erros conhecidos de template
ficam bloqueados; recusas temporárias têm retry limitado; timeout após possível
aceitação fica incerto. Testes cobrem esses caminhos; o recebimento real da Meta
na nova release continua pendente de autorização para uma jornada real.

## 7. Bloqueios e ações objetivas

| Gravidade | Situação | Ação para encerrar |
|---|---|---|
| Crítica | **Aberto:** não há backup real PostgreSQL/Redis verificável. | Autorizar e implementar backup independente ou snapshots/agenda do plano adequado; definir RPO/RTO, testar restauração isolada de uma cópia real com tratamento privado e reconciliar fila/efeitos. Ensaio fictício não encerra este bloqueio. |
| Crítica | **Corrigido em dev:** isolamento por conta falhava na busca de tarefas. | Revisar e publicar somente a release com a correção; manter teste negativo como gate. Não usar 2772da2 sozinho. |
| Alta | **Aberto:** migração/consumidores incompatíveis; misturar versões perde retry/recall. | Aplicar o procedimento coordenado com contenção e pontos de parada abaixo. Migração só após autorização. |
| Alta | **Aberto:** nenhum template de lembrete compatível configurado. | Criar/aprovar template, configurar o mínimo nos remetentes, verificar metadados com cada credencial e autorizar prova real fora da janela. |
| Alta | **Corrigido em dev:** nota excluída retornava pelo histórico de plano. | Publicar a correção e preservar regressão de criação composta → exclusão → novo contexto. |
| Alta | **Aberto:** integração hospedada nova + Meta não exercitada. | Autorizar deploy e jornadas com Pedro; conferir DB, filas, resposta e recibo. Não liberar participante com base somente no harness. |
| Média | **Aberto:** gate remoto automático não exigido; draining dos workers não comprovado. | Executar checks no SHA candidato, ajustar configuração de contenção/draining na janela autorizada e conferir ausência de processos antigos. |
| Média | **Aberto:** duas inscrições de app na WABA, callback de cada uma não confirmado. | Identificar finalidade e configuração de ambas; não revogar nenhuma sem avaliar dependências. |
| Operacional | **Aberto:** job/bloqueio histórico de template. | Classificar antes da janela; não reativar aviso passado nem reenviar estado incerto para “limpar” contagem. |

## 8. Publicação e recuperação com pontos de parada

Procedimento concreto preparado, **não executado remotamente**:
[PUBLICACAO_M04.md](PUBLICACAO_M04.md). Ele contém interrupção controlada de
entrada/consumo, builds dos workers em modo inerte, migração pela API, verificação
de versões e retomada sem consumidores antigos. A pausa global da fila foi
ensaiada localmente; operações Railway e sua ordem não foram executadas.

**Autorização necessária depois desta entrega:** criar/configurar backup ou plano,
exportar/restaurar uma cópia real em destino privado isolado, criar template,
alterar variáveis/start commands/draining, interromper serviços, aplicar migração,
publicar e retomar consumidores, enviar teste WhatsApp real e incluir participante.
Cada proposta deve apontar a release, serviços, impacto e efeitos externos concretos.
O convite só vem depois de backup real, publicação íntegra, jornada real com Pedro,
template fora da janela com recibo, consentimento próprio e isolamento do participante.

## 9. Reproduzir os ensaios sem risco de produção

Ver [EXECUTAR_M04_LOCAL.md](EXECUTAR_M04_LOCAL.md). Os scripts só aceitam banco
local terminado em `_test`, porta 5435 e Redis loopback 6381, DB 15. Não carregam
o `.env` antigo. O helper de IA é dry-run por padrão, exige autorização/total gasto
explícitos e conserva resposta/trava em erro incerto. Não refazer chamadas pagas
apenas para ler ou revisar a evidência existente.

Arquivos de domínio alterados: `context.guards.ts`, `context.retrieval.ts`,
`conversation.context.ts`, `queue/reminder.worker.ts` e novo `reminder.processor.ts`.
Suporte: compose isolado, quatro scripts de ensaio/checkpoint, helper de fixtures,
regressões de memória/startup/orçamento, documentos e evidência JSON vinculada.
