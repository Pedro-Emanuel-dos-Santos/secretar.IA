# Auditoria do sistema existente — 28/10/2026

Nota posterior: a auditoria abaixo descreve a baseline indicada. Na branch de
desenvolvimento, a Missão 03 acrescenta recuperação contextual por conceitos,
origem de notas e foco de consulta com versão; ver [arquitetura de memória v1](MEMORIA_CONTEXTUAL.md).
Esse código ainda não está na Railway. Nenhuma nova infraestrutura/migração foi
introduzida pela M03; a migração aditiva de e920084 continua exigida na publicação.

Referência local: `4d4c56b`, branch `codex/railway-ready-20261020`.
Etapa de leitura e documentação: nenhuma alteração funcional ou de produção.
Foram examinados os caminhos ativos de entrada, contexto, IA, execução, envio,
memória, operações, configurações e suítes. Não é auditoria independente de
segurança, certificação de cobertura ou inspeção de todos os registros privados.

## Fluxo ativo

1. Meta chama `/webhook`. `backend/src/http/webhook.handlers.ts` valida HMAC dos
   bytes originais e escopo comercial. `inbox.receiver.ts` persiste mensagens
   suportadas; identidade única no banco deduplica reentregas. Só responde sucesso
   após persistir; falha retorna erro para permitir reentrega.
2. `src/inbox-worker.ts` chama `domain/inbox.processor.ts`: assume trabalho com
   lease, separa interpretação de execução, persiste interpretação e resposta.
   Retentativas usam estado, contagem e backoff; não dependem só da memória do processo.
3. `conversation.processor.ts` resolve comandos, botões e referências seguras
   antes de consultar IA. `conversation.service.ts` → `context/context.builder.ts`
   → `conversation.context.ts` compõe contexto do contato e conta.
4. `services/ai.service.ts` pede JSON ao roteador, registra uso informado pelo
   provedor, valida e aplica guardas de referência, tempo e identidade.
5. `inbox.processor.ts` despacha ações de domínio em transação: notas, memória,
   agenda, projetos, pendências, lembretes e planos revisáveis. Respostas de ação
   são produzidas pelo servidor a partir dos registros.
6. `ScheduleOutbox` → `schedule.relay.ts` → BullMQ/Redis. O worker
   `queue/reminder.worker.ts` verifica versão, estado e atraso antes do envio.
   `ReplyOutbox` → `reply.relay.ts` envia respostas com controle persistido.
   `delivery.receipts.ts` reconcilia recibos da Meta.

## Persistência e infraestrutura

Node 24, TypeScript, Express, Prisma 7, PostgreSQL, BullMQ e Redis.
Modelos: IncomingMessage, ReplyOutbox, ScheduleOutbox, User, ContactPreference,
Reminder, Appointment, BusinessSubject, SubjectPending, KnowledgeFact, Event e AiUsage.
Notas e memórias pessoais usam eventos tipados; fatos têm revisões e origem.

Railway consultada nesta auditoria: API, inbox, lembretes, Redis e Postgres online,
uma réplica por aplicação, sem falhas recentes ou trabalho pendente informado.
Deploys ativos: API `6ab19165-f02d-454a-b181-729dd5de3cd7`, inbox
`1150569b-927b-472d-b64b-94a65e508c32`, lembretes
`614ab584-6b70-4083-81d6-f0fb781dba11`. Correspondem à entrega anterior registrada
em `backend/NEXT-SESSION.md`; `4d4c56b` continua local.

Configuração efetiva informa RAILPACK, `/backend`, branch acima e `checkSuites:false`.
Arquivos `backend/railway*.json` propõem Dockerfile. Portanto arquivos do repositório
não comprovam sozinhos a configuração aplicada. API executa migração no pre-deploy;
workers aguardam campos necessários antes de consumir trabalho. `/health/ready`
verifica banco e Redis, não qualidade da IA nem entrega WhatsApp.

## IA: funcionamento real no código e limites da inspeção remota

`src/ai/ai-router.ts` possui modos openai, ollama e hybrid; padrão é hybrid.

| Modo | Seleção e falha |
|---|---|
| openai | OpenAI diretamente; falha volta à retentativa persistida, sem fallback Ollama |
| ollama | Ollama diretamente; falha volta à retentativa, sem fallback pago |
| hybrid | OpenAI se último conteúdo tem >600 caracteres ou palavras-chave; senão Ollama, com fallback OpenAI em erro |

Problema reproduzido nesta auditoria com provedores substituídos, zero rede:
pedido bruto “oi” seleciona Ollama; JSON com `currentMessage:"oi"` e histórico
sintético de 700 caracteres seleciona OpenAI (752 caracteres totais). Na aplicação,
o último conteúdo enviado ao roteador é o contexto JSON. Logo essa heurística mede
volume e palavras do contexto, não apenas complexidade do pedido. Não há seletor
por qualidade medida, preço, latência recente ou circuito de indisponibilidade.

OpenAI usa Responses, modelo padrão gpt-4.1-mini, JSON, store:false, máximo 2800
tokens, timeout 28s, SDK sem retries. Ollama usa `/api/chat`, padrão
localhost:11434 e llama3.1:8b, timeout 12s. Contexto/interpretação têm limite externo
de 45s; esse limite não equivale a cancelamento de toda operação subjacente.
Regras do `rules.provider.ts` não interceptam JSON; comandos determinísticos da
conversa são uma camada distinta que efetivamente evita consultas ao modelo.

Remotamente foram confirmados os NOMES AI_MODE, OPENAI_MODEL e OPENAI_API_KEY no
inbox. O conector redige os valores: o modo e modelo efetivamente configurados
nesta inspeção permanecem **não verificados**. Última avaliação real registrada
usou gpt-4.1-mini; isso não prova a configuração atual. Não foram lidas chaves.
Não há serviço Ollama nem variáveis OLLAMA_BASE_URL/OLLAMA_MODEL na configuração
renderizada consultada. Não há evidência de um Ollama acessível pela aplicação
hospedada; não foi feito teste de rede do container. Não afirmar “híbrido ativo”.

AiUsage já persiste provedor, modelo, tokens de entrada/saída/cache, duração e
resultado por tentativa, sem texto. Contadores ausentes ficam desconhecidos.
Ainda faltam motivo de rota, rastreio de cada tentativa de fallback, métricas
comparáveis de latência/qualidade e custo estimado com tabela versionada.
Ollama não fornece uso ao ledger atual; em falha híbrida o provedor pode ficar unknown.
Há limite de pedidos por contato, mas isso não é teto financeiro mensal.

## Memória e continuidade

Histórico recente: até quatro mensagens em 30 minutos. Há até vinte entradas de
sete dias para rascunhos/referências; isso não é memória completa de conversa.
Contexto inclui amostras limitadas de lembretes, compromissos, projetos, fatos,
notas e pendências. Busca de notas e memória pessoal é lexical, sem recuperação
semântica ou resumo persistido de assuntos antigos. Informações existem no banco,
mas podem não chegar ao modelo ao retomar um assunto distante.

Memória pessoal exige explicação entregue, aceite específico, conta/contato e
AI_MODE exatamente openai (`personal.memory.consent.ts`). Hybrid/ollama desativam
essa inclusão, mesmo com OpenAI no fallback. Alterar roteamento sem revisar essa
política pode quebrar personalização ou compartilhar dados sem consentimento correto.
Fatos de projeto, notas e mensagens têm políticas distintas; não confundir seu
envio contextual com o consentimento exclusivo de memória pessoal.

## Confiabilidade, acesso e lacunas operacionais

Versões, leases, locks, transações e savepoints cobrem duplicação, alterações
concorrentes e propostas atômicas. Envio sem resposta conclusiva fica incerto;
não é repetido automaticamente para evitar duplicação externa. Aceitação da Meta
é diferente de entrega ao aparelho. Não há garantia geral de exactly-once em rede.

Lembretes vencidos além da tolerância tornam-se missed. Resumo diário exige adesão
e horário; varredura tem janela de cinco minutos, não recupera todos os resumos
perdidos após interrupção. Proatividade ampla e adaptativa não está implementada.

**Bloqueio importante do beta:** no inventário renderizado do worker de lembretes
existe WHATSAPP_REMINDER_TEMPLATE_APPROVED, mas não WHATSAPP_REMINDER_TEMPLATE_NAME.
`whatsapp.service.ts` não tem nome padrão; `whatsapp.policy.ts` bloqueia fora da
janela sem nome aprovado/configurado. Linguagem tem fallback pt_BR no envio.
Um lembrete imediato bem-sucedido não comprova aviso no dia seguinte. Verificar
template real, configuração e entrega fora da janela antes do beta.

Áudio exige feature flag, allowlist e consentimento por provedor. Inbox não lista
allowlist nem configuração de Whisper/provedor: áudio de produção não está
comprovado. Exportação ICS existe; sincronização Google Agenda não existe.
Chamadas, envio a terceiros, conectores municipais e permissões de equipe ausentes.

Isolamento operacional usa telefone + conta comercial e guardas de IDs/versões;
API administrativa usa token, não identidade/permissão de cada cliente. Não existe
modelo de organização/equipe com papéis. Exclusão local com confirmação remove
conteúdo e mantém controles técnicos; pode aguardar resolução de envio incerto.
Não apaga dados já mantidos pelos provedores. Retenção automática não configurada.
Backups e restauração não foram exercitados nesta auditoria.

## Evidências de qualidade e limitações

Última validação local existente: TypeScript, 257 unitários e 305 integrações;
19 testes específicos repetidos após último ajuste. Logs em workspace Codex:
compound-existing-final.log e compound-existing-target-final.log. Não executamos
novamente a suíte por esta entrega ser documental. Os testes usam provedores
simulados e banco local isolado; não demonstram inteligência conversacional real.
Não foi gerado relatório percentual de cobertura.

Entrega anterior publicada teve avaliação real de plano 8/8, após falhas e
correções registradas; não valida automaticamente os novos fluxos locais.
Teste real de lembrete e ciclo Piloto constam do histórico com Pedro, sem prova
de uso diário sustentado por participante externo. Ainda falta matriz de jornadas
com provedor real, observação externa, duração de vários dias e recuperação operacional.
