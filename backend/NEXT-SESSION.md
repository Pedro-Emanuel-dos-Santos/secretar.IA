# Continuidade da Secretár.IA — 28/10/2026

## Novo fluxo: conversa e plano executável — validação local

Ver ASSISTANT-PLANS.md. Nova action assistant_plan com2–5 criações revisáveis:
anotação, lembrete e compromisso. Confirmação natural contextual pelo servidor,
revisão integral da proposta, atomicidade com savepoint e idempotência; nenhuma
ação antes da revisão/aceite. Sem migração/env novo. Memória pessoal continua
com consentimento próprio; chamadas/mensagens a terceiros não fazem parte.
TypeScript,256 unitários e295 integrações na suíte completa final aprovados;
dez cenários integrados dedicados ao plano e contexto. Raciocínio agora recebe
até12 acompanhamentos atuais, sem itens encerrados/outras contas/pessoas.
Provider OpenAI permite saída até2800 tokens para JSON de várias etapas.
Scripts de avaliação somente de interpretação: evaluate-assistant-plan.cjs
--allow-provider após build no inbox, usando oito entradas fictícias sem ações.
Ainda não publicado neste registro; produção3f630cc abaixo até checar rollout.
Logs assistant-plan-release-check-* e assistant-plan-* na workspace. Não declarar Jarvis irrestrito ou teste
real do plano aprovado antes de comprovar a experiência no WhatsApp.

## Produção mais recente — central3f630cc — 28/10/2026

API a8029058-f850-4062-864d-38c54d6a456b,
inbox0e5f1f78-ef07-43bf-b5f1-dd539b18cc93 e
lembretes e1e7f8e8-f86b-4446-8b28-0bdb63261864 Active; readiness ready.
TypeScript/253 unitários/285 integrações aprovados. Avaliação real fictícia7/7
no gpt-4.1-mini (56370 entrada/280 saída), sem ações ou WhatsApp. Prévia SQL
somente leitura renderizou panorama real do Piloto e atenção, sem erro.
Ainda não há teste do novo painel enviado pelo usuário no WhatsApp. Registros:
work/workspace-overview-release-20261028.md e imagens workspace-overview-*.
Ver PRODUCT-DIRECTION.md para direção do produto, sem confundir plano com código.
As notas locais/de preparação abaixo são históricas.

## Central de acompanhamento — 28/10/2026 — validação local

Ver WORKSPACE-OVERVIEW.md e PRODUCT-DIRECTION.md. Implementados panorama de
projetos/clientes com status, origem e próximas ações; painel de atenção que
combina agenda/avisos/pendências; retornos agrupados por referência informada.
Perguntas comuns locais sem IA e rota workspace_overview para outras formulações,
com resultado produzido pelo executor a partir do banco. Sem migração/env novo.
Sete integrações e três unitários dedicados passaram. Suíte completa em
work/workspace-overview-check-20261028.log na workspace. Produção ainda d54f3e3
até publicar/verificar. Avaliação real fictícia opcional via script
scripts/evaluate-workspace-overview.cjs --allow-provider após build no inbox,
sem copiar chaves antigas locais. Não afirmar novo painel em produção até checar.

## Produção mais recente: continuidade integrada d54f3e3

API d6999280-2c37-4d07-8ca3-7492896f7515,
inbox5d800d53-1c20-486b-be7b-02eb927402e1 e
lembretes b34c0ac4-8432-4570-a0eb-986f7ced46ab Active; readiness ready.
Sem migração. Código inclui o ciclo de PENDING-CONTINUITY.md.250 unitários e
278 integrações aprovados; sete novos cenários, onze antigos e250 unitários
repetidos na revisão final. Ciclo completo real no WhatsApp ainda não validado.
Registros:work/continuity-release-20261027.md e continuity-release-active-20261027.png.
Os estados de preparação abaixo são históricos.

## Continuidade integrada em validação local

Ver PENDING-CONTINUITY.md. Implementado encadeamento na mesma pendência por
referência auditada: retomada, espera com pessoa explícita/pronome, troca de
pessoa, nova próxima ação e conclusão explícita. Sem migração. Sete cenários
de integração e dois unitários dedicados; conferir resultado final no log
work/continuation-final-check-20261027.log na workspace.250 unitários/278 integrações
aprovados; revisão final repetiu sete novos, onze antigos e os250 unitários.
Produção ainda4401f60 até
publicar e verificar. Não afirmar novo ciclo confirmado no WhatsApp.

## Publicação mais recente: histórico4401f60

Histórico e consulta direta publicados nos três serviços, todos Active:
API dc9ce930-0c8c-4ed5-8d93-e74b254d9c7f,
inbox62f266d9-89a8-4d72-a3f6-19c2916034aa,
lembretes e1240139-c6a6-46ca-9020-d806951a57d7. Readiness ready após publicação.
Sem migração, alteração de callback ou credencial. Os estados locais descritos
abaixo foram superados. Pedro foi convidado a mandar “O que mudou no projeto
Piloto?”; teste real confirmado: completed sem erro, resposta aceita/lida,
zero chamadas IA e zero evento de mutação. Texto mostrou antes aguardando
Evandro/pedir retorno e após/atual pendente/revisar o contrato, com origem/data.
Pendência versão1 e fatos revisão1 preservados. Próximo incremento: acompanhar
a mesma pendência após “Já revisei, agora falta ele assinar”, com referência
inequívoca, versão e auditoria; ainda não implementado.
Registro na workspace:work/history-release-20261027.md.

## Incremento local posterior: histórico das pendências

Otimização posterior: consultas completas com nome explícito agora passam por
subject.history.lookup.ts antes de buildContext/interpret. Executor continua
verificando nome exato e conta/contato. Não usa o atalho para pedidos compostos,
negações, pronome ou campo específico.248 unitários e cinco integrações afetadas
aprovados, incluindo inbox sem IA, ausência de mutação e outra conta. TypeScript
aprovado. O estado de publicação permanece local; não confundir com21648b1.

Ver SUBJECT-HISTORY.md. search_facts/includeHistory sem campo específico agora
inclui alterações auditadas de pendências com antes/depois, posição atual e origem.
Leitura isolada por contato/conta/assunto, sem migração. Quatro testes direcionados
e TypeScript aprovados. Suíte completa:246 unitários e269 integrações aprovadas;
quatro testes direcionados repetidos na revisão final. Ainda não publicado;
produção permanece21648b1 abaixo.
Conferir resultado completo em work/pending-history-check-20261027.log na workspace.

## Estado atual confirmado — ler primeiro

Código funcional 21648b1 publicado na API, inbox e lembretes; readiness ready.
Deploys verificados: API fca36c74-c075-49fd-8b23-857adfe44efb,
inbox 9adbe55d-6f9f-4114-bca0-0229c184b9e5 e
lembretes ae5da469-68a3-4c47-b3a0-571694a56eda, todos Active.
Sem nova migração ou alteração de callback/credenciais nesta entrega.

Teste real de Pedro concluído: “No projeto Piloto, o Evandro respondeu;
agora falta revisar o contrato.” A mesma pendência Acompanhar assinatura do
contrato passou de waiting/versão0 para pending/versão1, waitingFor nulo e
nextAction revisar o contrato. Existe uma única pendência no projeto. Auditoria
preserva Evandro e pedir um retorno ao Evandro como posição anterior; resolução
interlocutor_response. Resposta provider_accepted/read, sem erro e sem chamada IA.
Fatos atuais preservados: status em análise; contrato ainda não foi assinado,
ambos revisão1. Consulta anterior do projeto também foi confirmada por Pedro.

Validação:246 unitários,264 integrações na execução completa,11 integrações
direcionadas na revisão final, TypeScript e imagem final aprovados. Não somar
as repetições como testes distintos. Evidência operacional na workspace:
work/pending-followup-release-20261027.md. Ver PENDING-FOLLOWUPS.md para limites.

Próximo incremento recomendado: consulta conversacional do histórico de um
projeto, distinguindo posição atual de mudanças anteriores e incluindo a origem.
Primeiro inspecionar as consultas existentes; não assumir ausência do recurso.
Não usar o Piloto real para mutações de teste. A frase “Evandro respondeu” não
comprova assinatura do contrato nem conclusão da pendência.

## Notas históricas — os estados de publicação abaixo foram superados

O bloco acima é a referência atual. As notas abaixo preservam o percurso e não
devem ser usadas para concluir que os incrementos atuais ainda aguardam deploy.

## Continuidade de pendências — preparação histórica

Implementado retorno “O Evandro respondeu, agora falta revisar o contrato” com
referência recente confiável ou prefixo explícito “No projeto Piloto,”. Atualiza
a mesma pendência waiting→pending, limpa espera, preserva fatos e histórico.
Revalidação no executor com ID/versão internos, sem confiar em ID da IA; duas
pendências possíveis pedem esclarecimento. Ver PENDING-FOLLOWUPS.md.
TypeScript,264 integrações e11 cenários repetidos na revisão final aprovados.
Imagem em finalização; ainda não declarar publicado este incremento. Produção
confirmada abaixo continua0d9004f até verificar o novo rollout.

## Publicação concluída — estado mais recente

Teste real posterior passou: projeto Piloto criado com status em análise; mensagem
composta gerou apenas proposta pending e nenhuma pendência antecipada; usuário
enviou CONFIRMAR ATUALIZAÇÃO. Proposta applied, campo contrato ainda não foi
assinado e uma única pendência aguardando Evandro, próxima ação pedir retorno,
ambos ligados à mensagem de origem. Status inicial preservado. Resposta aceita
e lida, nenhuma chamada IA na confirmação e nenhum lembrete novo. Logs e prova:
work/integrated-release-20261027.md e pilot-proposal-applied-20261027.png.
Consulta livre posterior do projeto ainda pode ser avaliada; não afirmar esse
último passo como já testado.

Código0d9004f publicado nos três serviços. API27fa8881-7e54-489f-a527-ec56251f4308,
inbox381bb165-6aa5-4453-94ec-4227b0462b5d e lembretes8969c401-0622-436b-a54a-
56d856107c19 Active. Migração17 aplicada em produção às17:58:30 BRT; health ready.
Consulta somente leitura confirmou contagens preservadas e reunião28/10 às10–11
com aviso09:45 status scheduled. SubjectPending vazio após deploy: avaliação de
IA não inseriu dados. Worker de entrada iniciou. Último registro operacional:
work/integrated-release-20261027.md na workspace. As notas de preparação abaixo
são históricas. Esta atualização documental local não requer outro deploy.

Primeira conversa real em acompanhamento: Pedro confirmou envio de “Anota no
projeto Piloto: status em análise.” Conferir cadastro, resposta e origem, depois
testar proposta composta. Não afirmar que o ciclo completo passou antes disso.

## Publicação integrada em preparação

Avaliação real do prompt:7/9 inicialmente, regras de seleção corrigidas e11/11
na repetição com dois exemplos novos; todas as respostas passaram no parser atual.
Ver SUBJECT-PROPOSAL-EVALUATION-20261027.md. Sem dados reais enviados à IA.
Backup atual salvo na workspace (backups/secretaria-production-before-subjects-
20261027.dump), SHA256d654c16626c6174681ca4573cd07977c8afea112a18a869fb34cf2cc8e0b8996.
Ensaio PostgreSQL18 isolado restaurou backup e aplicou migração17, preservando
contagens. Container de ensaio parado. Não marcar publicado até confirmar os
três serviços Active, a migração e health; produção confirmada ainda fe88705.

## Incremento mais recente: propostas compostas

Ler SUBJECT-PROPOSALS.md. Implementado localmente: propose_subject_update e
comandos controlados de confirmar/descartar. Campo factual e nova pendência sem
prazo são persistidos atomicamente após revisão da proposta enviada, com
expiração, revalidação e consumo único. Sem migração extra além de SubjectPending.
Ainda sem push/deploy; produção continua fe88705. Validação real de IA/WhatsApp
pendente; não confundir simulação de fornecedor com comprovação da experiência.
Validação concluída:244 unitários,255 integrações PostgreSQL, TypeScript e imagem
subject-proposal-release-20261027 aprovados; smoke compilado Node24.22.1/UID1000/
SubjectPending/comando de confirmação passou sem banco ou mensagem real. Logs
subject-proposal-* na workspace. Próximo marco: avaliação com IA real da captura
de propostas e preparação da publicação coordenada (backup e migração17 antes
de liberar a versão integrada). A tabela nova ainda existe só no banco local.

## Incremento local mais recente: pendências sem prazo

Ler SUBJECT-PENDINGS.md. SubjectPending, ações de criar/listar/atualizar e resumo
do assunto implementados. Migração aditiva20261027170000_add_subject_pendings
aplicada só no banco local de testes. Worker aguarda tabela. Sem push/deploy;
produção continua fe88705. Não apresentar este incremento como proposta composta
pronta na época dessa nota; essa etapa foi implementada depois, conforme seção
de propostas compostas acima, e permanece local.
MEU DIA também mostra até três pendências sem prazo com próximas ações, sem
confundi-las com avisos de hoje. Validação final dessa conexão: TypeScript e47
integrações afetadas aprovados. Núcleo:243 unitários,240 integrações na suíte
completa e11 cenários repetidos na revisão. Imagem subject-pending-release-20261027
foi construída antes do acréscimo em MEU DIA; reconstruir antes de publicar.

Pedro incorporou a visão de assuntos com continuidade ao desenvolvimento.
Ler ASSUNTOS-E-ACOMPANHAMENTO.md antes da próxima implementação: primeiro
proveniência nas consultas, depois atualização proposta, pendências sem prazo e
resumo por assunto. Aproveitar BusinessSubject/KnowledgeFact e vínculos existentes;
não confundir esses recursos com gestão municipal pronta. Não alterar produção ou
criar migração apenas por este plano. A última publicação de código deste ciclo é
fe88705: consulta da reunião no WhatsApp confirmada pelo usuário às 10–11 em 28/10.
As notas abaixo são históricas; referências antigas de produção não são o estado atual.

## Incremento de origem e histórico — implementação local

Consultas search_facts e subject_overview agora apresentam data/origem dos fatos.
Só atribuem ao usuário uma mensagem do mesmo contato/conta; legado sem origem
recebe aviso explícito. Perguntas sobre mudanças de um assunto identificado são
encaminhadas a search_facts com versões anteriores, não a resposta livre do modelo.
Isso não é diff semântico, prova documental ou decisão formal. Sem migração.
Pedro esclareceu que quer o pai usando uma versão integrada no cotidiano, não um
roteiro de teste. Fechar propostas, pendências sem prazo e próximas ações antes de
apresentar esse incremento isolado como produto pronto. Número dele não informado.
Não houve publicação deste incremento; produção continua fe88705.
Validação: TypeScript atualizado aprovado, 240 unitários na repetição final e
230 integrações com PostgreSQL local aprovados. Provedores simulados; sem uso
real por outro usuário. Logs subject-origin-* na workspace. A imagem iniciada
antes da última alteração de consulta não deve ser usada como release final.

# Retomada da Secretár.IA — 21/10/2026

## Estado confirmado mais recente

- 27/10, teste real após f9e6f3b: criação reunião amanhã09h–10h/aviso08h45 correta e entregue. “Melhor às dez” interpretado como reagendamento, porém modelo devolveu16Z e preserveRescheduleParts conservou13hBRT. Hotfix local usa relógio literal em correções só de hora, mantendo dia/fuso/versão sem depender de timestampIA. Regressões de horário escrito/números/qualificadores e integração9h→10h, duração1h eaviso09h45. Conferir publicação e reparo controlado do teste no work/deploy-progress-20261027.md. Pedidos completos de dia+hora ainda seguem interpretação existente; não presumir que toda ambiguidade de linguagem foi resolvida.

- 27/10, runtime: Node24.22.1 fixado nos Dockerfiles, engines mínimo sincronizado, body-parser2.4.0 no lockfile após alerta de DoS confirmado. Auditoria npm produção:0 conhecidas. Reconstrução limpa e smoke Node/non-root/entrypoints/sem.env/TLS passaram; endpoints eMudhra retornaram CERT_REVOKED. Imagem de áudio opcional recebe mínimo certifi, mas não foi reconstruída. Ver RUNTIME-SECURITY-20261027.md. Conferir rollout atual nos registros da workspace antes de presumir publicação.

- 27/10: seis achados da revisão independente corrigidos localmente: perguntas não reagendam por recuperação determinística; duração composta e intervalo numérico sem truncamento; consentimento de áudio vinculado a explicação aceita; respostas serializadas por conversa; paginação evita bloqueio global por um contato. Revisão cruzada encontrou início DST ambíguo, também corrigido. TypeScript, compilação, 233 unitários e 227 integrações com PostgreSQL local isolado aprovados; teste direcionado adicional após ajuste DST passou. Ver REVIEW-FIXES-20261027.md. Sem push/deploy, IA real ou envio WhatsApp nesta rodada. Log review-fixes-integration-20261027.log na workspace. Em 23/10, usuário trocou PostgreSQL/Redis, três serviços foram republicados e health ready confirmado; acesso público dos bancos ausente e GitHub Railway limitado a secretar.IA/gestao-associativa. Runtime/certificados e revogação de chaves antigas ainda precisam confirmação.

- Novo incremento local: alternativas após conflito com duração conhecida, até três opções posteriores no mesmo dia local, sem presumir término de evento desconhecido. Escolha “a segunda opção” recupera pedido original depois de resposta aceita e revalida escopo, validade, versão e conflitos. Snapshot consumido atomicamente impede marcação duplicada; rollback restaura. Fuso/DST e antecedência dos avisos considerados. Ver APPOINTMENT-SUGGESTIONS.md. Sem migração/push/deploy. Validação concluída: 222 unitários, 224 integrações e build aprovados. Logs appointment-suggestions-final.log e appointment-slots-unit-final.log na workspace; provedores simulados, banco isolado, IA real e WhatsApp pendentes.

- Novo incremento local: duração explícita de compromissos, preservação ao reagendar/completar rascunho, alteração só da duração sem trocar início, prevenção transacional de sobreposição e agenda com eventos atravessando meia-noite. Término em confirmação/lista/histórico/ICS. Sem duração padrão para eventos antigos e sem presumir agenda Google disponível. Referência a reunião não escolhe visita em foco. Ver APPOINTMENT-DURATION.md. Sem migração/push/deploy. Build/TypeScript, 213 unitários na revisão final e suíte de 216 integrações aprovados; provedores simulados. Logs appointment-duration-final.log e appointment-duration-unit-final.log na workspace. IA real/WhatsApp pendentes.

- Núcleo pessoal implementado localmente: remember_personal/recall_personal/update_personal/forget_personal para rotina, preferência, pessoa e objetivo, com origem, versão, isolamento e deduplicação. Consentimento específico por contato antes de guardar/usar pela OpenAI; proprietário autorizou essa arquitetura explicitamente após bloqueio de revisão automática. Comandos MEMORIA PESSOAL, ACEITO MEMORIA, MINHAS MEMORIAS e DESATIVAR MEMORIA. Revogação filtra registros e cópias no histórico, sem prometer apagar dados já processados. Sem aprendizado silencioso nem agendamento automático. Exportação .ics administrativa com autenticação, filtro de contato/conta/período e limite sem truncar; é cópia manual para Google Agenda, não sincronização. Ver PERSONAL-SECRETARY.md para produto, consentimento e OAuth futuro.
- Verificação do núcleo pessoal: build/TypeScript, 207 unitários, 208 integrações e repetição final de 11 integrações afetadas aprovados. Provedores simulados, dados fictícios e banco isolado. Sem migração, publicação, uso de credenciais novas ou conexão Google. Avaliação com IA real e teste WhatsApp pendentes; produção permanece em 1798ff2.

- Atualização maior de continuidade local: foco único por 30 minutos, somente após resposta aceita, consulta exata fora das prévias, referências demonstrativas com versão, último/penúltimo da lista e reagendamento em dois turnos preservando o novo dia. Documentação e roteiro: CONVERSATION-V3.md. Sem migração, push ou deploy. Produção permanece em 1798ff2. Avaliação com IA real e WhatsApp pendente para esse incremento.
- Validação da atualização maior: 199 unitários e build na revisão final, suíte completa de 197 integrações e repetição de 13 integrações afetadas aprovadas. Logs conversation-v3-* na workspace. Um teste de isolamento inicialmente misturava um ID inválido recente na própria conta com a referência da outra conta; fixture separada, proteção não relaxada. Regra final conserva avisos omitidos ao reagendar e limpa rascunho ao cancelar/concluir.

- 22/10, produção confirmada: commit 1798ff2 ativo na API, inbox e lembretes; quatro migrações aplicadas, workers iniciados e health 200/ready. Teste WhatsApp recebido às 19:46:20 BRT, resposta lida; lembrete marcado para 19:47:20 (exatamente +60 segundos), aceito e lido. Backup privado validado na workspace. Verify Token na Meta, PostgreSQL/Redis, revogação das credenciais antigas e sincronização local permanecem pendentes.
- Incremento local seguinte: correções completas como “melhor amanhã” e “na verdade, pra depois de amanhã” recuperam um único item em foco mesmo com classificação incorreta da IA, preservam hora/fuso/versão e não criam duplicata. Pedido incompleto em andamento tem precedência; dois alvos ou nenhum geram pergunta curta. Perguntas, negações e frases com novo pedido não são convertidas por essa regra. Sem migração, alteração de callback ou novo deploy. Ver RESCHEDULE-PARTS.md.
- Validação desse incremento: TypeScript/build, 188 unitários e 186 integrações locais passaram. Provedores simulados; avaliação com IA real e WhatsApp pendente para as novas frases. Log day-correction-check.log na workspace.

- 22/10: usuário autorizou explicitamente aplicar seis variáveis e publicar os três serviços. Deploy Changes aplicado; branch ativa enviada de 3ea661c a e1d13a3. API anterior subiu com chaves novas, mas build e1d13a3 falhou por heap de compilação 256 MB. Dockerfiles corrigidos para 1024 MB somente no estágio build. Imagem padrão construída e smoke non-root/entrypoints/sem ENV herdada aprovados. Publicação da correção em andamento; conferir commit ativo, migrações e workers antes de dizer pronto. Verify Token na Meta, rotação PostgreSQL/Redis e revogações antigas pendentes. Tentativa de abortar build antigo rejeitada; modal cancelado, não houve aborto. Ver RELEASE-20261022.md e work/deploy-progress-20261022.md da workspace.

- 22/10, publicação retomada após liberação Hobby: backup real do PostgreSQL 18 criado/download, leitura completa e SHA-256 local/remoto conferidos; arquivo privado na workspace, fora do Git. 183 unitários, 185 integrações e build aprovados. Código ad88ba8 enviado à branch remota codex/release-20261022, mantendo branch ativa de produção intacta. Três serviços conferidos com /backend e comandos corretos. Usuário confirmou credenciais antigas ainda não substituídas; entrada de novas credenciais no navegador exige intervenção dele. Nenhuma migração/deploy de produção, callback ou credencial alterados. Ver RELEASE-20261022.md.

- 22/10, continuação “e a agenda dela amanhã?”: leitura reconhecida mesmo se modelo tentar responder só conversa. Cadastro recente confiável é preservado, ausência pede nome; negação explícita não aciona essa recuperação. Avaliação --agenda ampliada passou em cinco turnos com IA real, alternando dias sem alterar cliente/horário. Build, 183 unitários e integrações direcionadas client-period passaram. Suíte completa anterior: 185 integrações. Sem deploy.

- 22/10: avaliação real de agenda por cliente encontrou list_reminders indevido para pedido explícito de agenda. Corrigida guarda para incluir compromissos, remover filtro herdado, preservar cadastro explícito e perguntar por homônimos; listas explícitas de tarefas/estados não são convertidas. Novo modo de avaliação --agenda passou em três turnos com IA real e WhatsApp simulado. Build, 182 unitários e 185 integrações aprovados nesta etapa; após refinamento de preservação do cadastro, unitários e avaliação real repetidos. Sem publicação ou migração.

- 22/10, agenda de depois de amanhã: novo período day_after_tomorrow no contrato, comandos locais completos e guarda de período em consultas por cliente/projeto. Usa segundo dia local após recebimento, não duração fixa de 48h. Pedido com amanhã + depois de amanhã é ambíguo e não escolhe silenciosamente. Testes cobrem virada UTC, mês bissexto, dia de 23h e inbox sem IA com fim exclusivo. Build, 181 unitários (rodada final) e 185 integrações passaram. IA real para novas formulações por cliente ainda não avaliada. Sem migração, deploy ou envio real.

- 22/10, agenda sem contagens zeradas: período vazio informa ausência de compromissos/avisos naquele intervalo, mas mantém espera, avisos anteriores e pausa. Build, 179 unitários e 184 integrações aprovados. Status Railway consultado: atualização de 19:42 UTC (16:42 Brasília) ainda mantém builds Hobby indisponíveis; Pro/Enterprise liberados. Comunicado de segurança sem novidade. Nenhum deploy nem credencial alterada.

- 22/10, agenda mais legível: hoje/amanhã com data única no cabeçalho e horários nos itens, períodos de vários dias preservam dia/mês. Intervalo personalizado conserva início/fim completos e fim exclusivo. Nome do cadastro sem duplicação nos títulos da agenda e espera. Consultas/filtros/contagens/estado intactos. Build, 178 unitários e 184 integrações passaram (agenda-readable-check.log). Sem IA adicional, migração, envio real ou deploy.

- 22/10, reconhecimento contextual: prompt distingue esquecimento, correria, boa notícia e demora, sem deduzir execução ou criar memória ao comentar. Avaliação de 17 turnos passou; revisão encontrou frase sugerindo anotação, corrigida no prompt e verificada em mais três turnos no novo modo --comments. WhatsApp simulado e dados fictícios. Build e 175 unitários aprovados; 184 integrações aprovadas no incremento anterior. Este incremento só altera prompt e avaliador. Variedade geral continua dependente do modelo. Sem deploy.

- 22/10, incremento seguinte: agradecimentos completos são respondidos localmente sem IA; não retomam reagendamento anterior. Texto misto/negado/interrogativo segue interpretação normal. Prompt com exemplos curtos e orientação contra filtros herdados de outro tipo de consulta. Avaliação ampliada passou em 15 turnos com IA real/WhatsApp simulado, incluindo agenda após agradecimento e pedido explícito após “só queria comentar”; sem ofertas genéricas detectadas nesse diálogo. Repetição de reconhecimento entre comentários diferentes ainda observada. Build, 175 unitários e 184 integrações aprovados. Sem publicação ou callback alterado.

- 22/10: avaliação com IA real de conversa natural passou em 11 turnos no banco local isolado, sem WhatsApp real. Novo modo `evaluate-business.cjs --allow-provider --natural` verifica estado/horário e seleção em dois turnos; registra ofertas genéricas como observações de estilo (ainda pendentes). Removida duplicação do nome completo em confirmações/listas/avisos, preservando nomes parciais/homônimos. Docker local foi reativado. Build, 173 unitários e 184 integrações passaram; log natural-live-check.log da workspace.
- Conta Railway confirmada Hobby pelo painel; 5/5 serviços online com versão antiga. Publicação não iniciada: status oficial ainda não liberou builds Hobby. Segurança: revisar/substituir credenciais armazenadas após incidente, sem alteração nesta etapa.

- Incremento de linguagem natural concluído localmente: perguntas só sobre o detalhe ausente, confirmações hoje/amanhã no fuso, avisos por antecedência, séries curtas, singular/plural e orientação de conversa sem ofertas automáticas. TypeScript, build, 172 unitários e 184 integrações passaram. A revisão automática voltou a funcionar na retomada. Expectativa de texto do aviso atualizada mantendo asserção do horário real no banco. Ver NATURAL-CONVERSATION.md; avaliação com IA real ainda pendente.
- Acompanhamento horário do incidente Railway criado neste chat (acompanhar-recupera-o-da-railway), silencioso sem mudanças relevantes. Apenas consulta fontes oficiais e avisa sobre recuperação/orientações de segurança; não publica, muda callback nem troca/revoga credenciais. Usuário decidiu seguir código local e aguardar recuperação.

- Mais recente: agenda por cliente/projeto e período, incluindo intervalos personalizados ISO com fuso até 31 dias. subject_overview com agendaPeriod/rangeStart/rangeEnd usa agenda filtrada; sem período conserva visão geral. Consulta por pronome recente preserva cadastro e período. Desambiguação explícita cliente/projeto homônimos e rejeição de intervalos incompletos/conflitantes. Sem migração, deploy ou callback alterado. Ver AGENDA.md; avaliação com IA real pendente.
- Verificação desse incremento: build/TypeScript, 166 unitários e 184 integrações passaram; seis cenários específicos repetidos após o último ajuste passaram. Banco local isolado e provedores simulados.

- Mais recente: agenda por período (hoje/amanhã/semana/próxima semana/próximos sete dias), unindo compromissos, avisos de tarefas e retornos em espera sem duplicar alertas. MINHA SEMANA e outros comandos locais consultam sem IA. Limites locais de calendário, leitura isolada por contato/conta e contagens reais. Sem migração nova, publicação ou callback alterado. Ver AGENDA.md; IA real pendente.
- Validação da agenda: build/TypeScript, 161 unitários e 178 integrações passaram, incluindo cinco integrações específicas. Nenhuma chamada real a IA/WhatsApp nessa verificação.

- Mais recente: escolha de tarefa em dois turnos (“o segundo” → “pode concluir/cancelar”), persistida como Event task_selection_focus. Só fica ativa após envio aceito da identificação; TTL cinco minutos e lista original até quinze. Consumo e alteração são transacionais. Outra resposta enviada/lista nova ou tarefa alterada invalida uso. Sem migração. Build, 155 unitários e suíte de 173 integrações passaram; IA real pendente. Ver TASK-SELECTION.md.

- Mais recente: reagendamento parcial preserva dia/hora não alterado em tarefas e compromissos. Resolução de hoje/amanhã/depois de amanhã/dia da semana simples usa recebimento/fuso; períodos vagos pedem detalhe. Versão do registro protege contra correção antiga. Build e 153 unitários passaram; suíte de 167 integrações passou. Ver RESCHEDULE-PARTS.md. Sem migração nova, publicação ou teste de IA real.

- Direção de produto registrada em PRODUCT-ROADMAP.md. subject_overview reúne dados atuais, compromissos, tarefas explicitamente vinculadas e notas que mencionam o nome. Vínculo de novas tarefas/séries, correção/remoção de vínculo existente e seleção ordinal de lista enviada implementados localmente. Correção de vínculo exige título/ID inequívoco, sem ordinal ou alteração de série inteira.
- Usuário decidiu aguardar Railway, continuar código local e manter callback atual. Túnel/API/workers iniciados para teste temporário foram desligados; banco e Redis locais permanecem disponíveis.
- Verificação do incremento por cliente: build/TypeScript, 137 testes unitários e 141 integrações passaram; quatro cenários de cliente repetidos após o ajuste final também passaram. Provedores simulados e banco local isolado; interpretação com IA real ainda pendente. Nenhuma migração adicional necessária para este incremento.
- Incremento seguinte adiciona migração aditiva 20261021150000_tasks_by_subject, aplicada somente ao banco local isolado de testes. Novas tarefas podem criar ou reutilizar cliente/projeto pelo nome completo explicitamente informado; nome parcial de cadastro existente é recusado sem criar tarefa. Não há associação automática das tarefas antigas. Workers aguardam subjectId antes de consumir trabalho. Após publicar, testar criação com cliente, resumo, espera, conclusão e recorrência; IA real ainda precisa de avaliação dessas novas ações.
- Validação mais recente do vínculo de tarefas: build/TypeScript, 138 testes unitários e 149 integrações passaram, incluindo oito cenários novos. Ver TASKS-BY-CLIENT.md. A confirmação, a lista e o aviso mostram o nome do cadastro.
- Incremento seguinte: seleção ordinal de tarefas pelo snapshot Event da lista numerada enviada, validade de 15 minutos, apenas enquanto não houver outra resposta enviada. Revalida versão/estado/progresso/título/horário com lock antes de alterar. Sem migração nova. Build, 143 unitários e 155 integrações passaram; IA real pendente. Ver TASK-SELECTION.md para limites, inclusive escolha sem ação e outras entidades.
- Incremento mais recente: set_task_subject e clearSubject permitem corrigir/remover cliente de tarefa ativa sem reagendar ou reenviar. Audita IDs, bloqueia envio incerto e compromisso, exige pedido explícito e confere vínculo esperado do contexto. Snapshots passaram a conferir também subjectId; listas antigas sem esse campo exigem nova consulta. Build, 143 unitários e 162 integrações passaram; oito cenários específicos repetidos após o ajuste final passaram. Próxima suíte completa terá 163 integrações. Nenhuma migração nova. Ver TASKS-BY-CLIENT.md.

- Incremento local adicional: perfil/fuso por conta, edição/exclusão de notas, consentimento informado de áudio, medição de tokens, limpeza confirmada de conteúdo e resumo diário opcional. Ver `PILOT-V2.md` para limites e roteiro de testes. As novas ações ainda não passaram pela IA real nem WhatsApp.
- Railway foi acessada novamente: serviços online, porém novos deploys temporariamente pausados por “Limited Access”. PostgreSQL não possui acesso público e o painel mostrou ausência de backups nativos. Não foi aberto acesso público ao banco.

- A avaliação de 21 turnos com IA real passou na retomada de hoje. Usou dados fictícios, banco local isolado e WhatsApp simulado; nenhum envio real.
- Foram corrigidos campos nulos omitidos pelo modelo, consulta factual respondida diretamente sem buscar o cadastro e busca textual de compromissos com artigos/acentos. Identificador inválido continua sendo recusado, sem substituição silenciosa por outro registro.
- A API pública respondeu HTTP 200 e {"status":"ready"}. Isso confirma prontidão da versão já publicada, não a publicação dos incrementos locais.
- O painel da Railway mostrou: “Dashboard and API unavailable, builds paused. We’ve found the cause and are working on a fix.” Nenhum deploy ou push foi feito durante o incidente.
- Branch: codex/railway-ready-20261020. Antes das correções da retomada, HEAD=a80f75d e havia cinco commits locais acima do remoto. Consultar git log/status atuais.
- Migrações novas foram aplicadas apenas ao banco local secretaria_inbox_test. Banco pessoal e produção não foram migrados nesta retomada.

## Próximos passos

1. Conferir acesso e recuperação do painel/API da Railway. Se persistir o incidente, não presumir liberação de builds.
2. Conferir backup do PostgreSQL e revisar commits locais. Depois de autorizada a publicação, enviar a branch e acompanhar pre-deploy da API com as migrações aditivas.
3. Confirmar o commit ativo na API, inbox e worker de lembretes. Workers aguardam os novos campos antes de consumir trabalho.
4. Conferir /health/ready e executar teste controlado no WhatsApp autorizado: compromisso futuro, avisos, alteração, cancelamento e tarefa aguardando/concluída.
5. Somente após o teste real anunciar as funções como disponíveis.

## Verificação local

No backend: npm run check:pilot -- --integration. O comando aceita apenas banco local terminado em _test e remove credenciais dos provedores no ambiente dos testes. A opção --migrate-test exige --integration e aplica migrações somente nesse banco.

Para IA real: build atualizado e scripts/evaluate-business.cjs --allow-provider, com INBOX_TEST_DATABASE_URL local e AI_MODE=openai. Usa tokens do provedor; mensagens WhatsApp são simuladas.

## Referências e limitações

FOLLOWUPS.md explica o incremento; SESSION-20261021.md registra a etapa noturna anterior à validação real. Essa avaliação pendente no documento anterior agora foi concluída na retomada.

Número definitivo, template fora da janela, áudio na nuvem, retenção completa de dados e medição financeira por usuário continuam pendentes. Há medição de tokens e limpeza parcial de conteúdo no código local, descritas em PILOT-V2.md. Não enviar segredos ao chat. Antes de usar o build novo com o banco pessoal, fazer backup e aplicar as migrações; ele ainda não recebeu as migrações novas nesta sessão.
