# Missão 03 — preparação do beta e primeira memória contextual

Etapa posterior autorizada: [avaliação OpenAI e prontidão do beta](AVALIACAO_INTELIGENCIA_BETA_20261028.md).
17 chamadas fictícias, custo estimado total US$ 0,0653804; oito cenários com aprovação
mais recente após duas rodadas completas e uma repetição focal. Corrigidos contrato
do prompt, consulta factual e utilidade do conselho. Sem deploy ou migração remota.
285 unitários, 331 integrações locais e build aprovados. Evidência bruta preservada;
resultados não equivalem a prontidão operacional nem a uma rodada final completa.

Concluída localmente em 28/10/2026, sobre e920084, na branch
`codex/dev-beta-reliability-20261028`. Código publicado só no GitHub para revisão.
Esta entrega **não declara o beta pronto** e não autoriza deploy por si mesma.

## 1. Diagnóstico da entrega anterior

O pacote e920084 preserva inbox/outboxes, versões, consentimentos, estado incerto
e migração aditiva. Revisamos roteamento por pedido atual, medição/fallback,
template aprovado, indisponibilidade, permissões e recuperação de retry.

Problemas corrigidos nesta missão:

- formatReminderReply não reconhecia delivery_retry, retry_exhausted e
  blocked_configuration; podia cair na promessa padrão “eu te lembro”. Agora
  comunica o estado sem fingir agendamento/entrega.
- URL Meta malformada lançava erro genérico antes de qualquer POST, confundindo
  configuração com envio incerto. Agora produz bloqueio conhecido sem HTTP.
- A apresentação do histórico podia reintroduzir instruções de memória/nota
  já corrigidas ou excluídas. Fontes atuais agora prevalecem sobre essas instruções.

Cache de aprovação foi avaliado e **não ativado**: testar status em cada envio
impede reutilizar APPROVED após PAUSED ou mudanças de acesso. Revalidação custa
latência/leitura Meta; otimização depende de TTL, escopo e invalidação comprovados.
Timeout após possível envio continua incerto, sem reenvio automático. Retries
confirmados continuam limitados e persistidos; testes anteriores foram repetidos.

Migração de e920084 é estruturalmente aditiva, mas workers antigos não entendem
os estados novos. M03 não adiciona migração, extensão nem infraestrutura; acrescenta
recall_context, que o parser antigo também não entende. Publicação e rollback
precisam conferir backlog, contratos e versões, não apenas retornar o código.
O [procedimento coordenado](DEPLOY_BETA_COORDENADO.md) trata backup, restauração
isolada, contenção, migração, verificações e rollback sem reenvio cego.

## 2. Arquitetura implementada

[Memória contextual v1](MEMORIA_CONTEXTUAL.md) descreve fontes e limites.

PostgreSQL existente → política de consentimento/escopo → consulta por conceitos
e palavras → seleção de registros atuais com origem/data/versão → contexto do
modelo ou resposta factual do servidor → ferramenta existente com validação.

As fontes são memórias pessoais autorizadas, notas, fatos atuais, projetos,
pendências, tarefas e compromissos. Não indexamos automaticamente todo o histórico.
O vocabulário reconhece sinônimos/conceitos do domínio em português, além de nomes
normalizados e relações de projeto. Não é semântica neural universal; embeddings
e pgvector foram adiados para quando avaliação/carga demonstrarem necessidade.

`recall_context` pode responder perguntas antigas sem modelo. Conselho usa o
contexto recuperado. Consulta entregue, única, sem corte e com versão atual pode
estabelecer foco temporário para uma correção; sem foco/identidade, esclarece.
Edição de memória/nota recuperada incorpora a versão do registro, não a do modelo.
Opt-out, exclusão e revogação são testados; nenhuma nova proatividade foi ativada.

## 3. Evidências obtidas em ambiente isolado

Suíte completa final: **277 unitários e 331 integrações aprovados**, zero falhas.
TypeScript sem emissão e build de produção passaram. A missão acrescenta sete
unitários e quinze integrações. Banco local `secretaria_inbox_test`, provedores
e transporte simulados; nenhum dado/serviço de produção foi usado pelos testes.

Log completo: [mission03-final.log](C:/Users/pedro/Documents/Codex/2026-10-15/cha/work/mission03-final.log).
Demonstrações específicas: [mission03-memory-target.log](C:/Users/pedro/Documents/Codex/2026-10-15/cha/work/mission03-memory-target.log).

| Jornada simulada | Resultado verificado |
|---|---|
| Memória de 12 dias: “emprego em desenvolvimento de software”; consulta “área em que procuro trabalho” | Recuperou valor, origem e data; resposta factual sem IA e sem criar nova memória |
| Memória antiga fora das onze recentes | Entrou no contexto relevante apesar de ausente do preview cronológico |
| Entrevista registrada 10 dias antes | Contexto entregou o compromisso ao interpretador de teste; conselho simulado não criou tarefa/convite |
| Duas entrevistas parecidas | Resposta pede escolha; não cria foco arbitrário |
| Consulta de reunião antiga entregue; depois “mudou para as 16h” | Alterou o mesmo registro de 14h para 16h, mesmo dia/fuso e versão incrementada |
| Consulta não entregue ou versão alterada antes da correção | Correção recusada; sem aplicar versão antiga |
| Correção/exclusão/revogação de memória | Recupera valor atual; excluído/revogado não volta pela recuperação ou instrução antiga |
| Dois usuários/contas | Conteúdo de um não entrou no resultado do outro |
| Projeto com acento consultado sem acento | Encontrou tarefa e pendência vinculadas à Praça Central |
| “Não guarde isso”, modelo sugere nota | Guarda do servidor impediu a gravação |
| Recuperação seguida de nota + lembrete | Propôs antes de gravar; confirmação criou ambas, com origem preservada |
| Amostra extensa e falha de banco/modelo | Informa limite; falha preserva estado/retry sem inventar lembrança ou mutação |

Os “dias” acima são datas históricas simuladas no PostgreSQL real de testes,
não dias de observação de um usuário externo. O conselho foi gerado por fixture;
**não comprova a qualidade de um modelo real**. O teste de correção usou o executor
real e conferiu o estado persistido, não só a aparência da resposta.

Durante a validação, falhas expuseram acentos na seleção SQL e um guard amplo
demais para correções existentes; ambos foram ajustados. Também corrigimos fixtures
para criarem compromissos pelo fluxo real com avisos e para confirmar planos com
contexto do banco. As primeiras execuções não foram apresentadas como sucesso.

## 4. Avaliação separada do modelo real

`backend/scripts/evaluate-context-memory.cjs` prepara oito cenários fictícios,
passando pelo parser e guardas reais, sem executor/banco/fila/WhatsApp.
Dry-run executado: zero chamadas, escritas ou envios. Não houve inferência paga.

Depois de build e autorização de orçamento, rodar com chave atual no ambiente:

```text
node scripts/evaluate-context-memory.cjs --allow-provider --budget-usd=0.10
```

O script não carrega .env, exige orçamento explícito até USD 0,25 e modelo com
preço conhecido. Reserva estimativa conservadora de entrada/saída por chamada;
interrompe por falha ou orçamento insuficiente. Isso não é limite de faturamento
da conta. Comandos determinísticos podem passar sem consultar o provedor;
resultado de interpretação não prova retrieval/ações, já verificados separadamente.
Registrar falhas/variabilidade e corrigir antes de publicar, sem chamar 8/8 de
garantia universal de inteligência.

## 5. Limites e próximos bloqueios

- Semântica restrita ao vocabulário explícito e busca lexical; não cobre todas as
  paráfrases, erros de grafia ou conhecimentos da vida do usuário.
- Amostras e trechos são limitados. A ausência de resultado não significa ausência
  de história. Consulta ambígua/cortada não autoriza foco de escrita.
- Registros autorizados são recuperados; conversa antiga nunca salva não vira
  memória permanente. Histórico técnico e consentimentos mantêm políticas distintas.
- Latência/carga hospedadas, qualidade do conselho real e uso externo por dias
  ainda não demonstrados. Não há novas notificações, chamadas ou Google Agenda.
- Backups/restauração hospedados e ensaio de rollout misto não foram executados.
- Template/WABA, permissões e entrega real fora da janela continuam pendentes.
  Um status online ou build aprovado não comprova essas jornadas.

## 6. Caminho até 04/11

Revisar este commit → avaliação real autorizada com orçamento → backup/recuperação
verificados → publicação coordenada autorizada → jornadas reais com Pedro →
consentimentos/acesso do participante e observação acompanhada.

Critérios, privacidade, métricas e bloqueios atualizados em [PLANO_BETA.md](PLANO_BETA.md).
Não convidar participante, trocar credencial, aplicar migração ou enviar mensagem
por causa da data. Railway foi consultada somente para leitura: três deploys ativos
e branch de produção mantidos; confirmação final das refs acompanha a publicação
exclusiva na branch de desenvolvimento.

## Arquivos modificados

- [AGENTS.md](../AGENTS.md)
- [backend/NEXT-SESSION.md](../backend/NEXT-SESSION.md)
- [backend/scripts/evaluate-context-memory.cjs](../backend/scripts/evaluate-context-memory.cjs)
- [backend/src/domain/action.executor.ts](../backend/src/domain/action.executor.ts)
- [backend/src/domain/assistant.plan.ts](../backend/src/domain/assistant.plan.ts)
- [backend/src/domain/context.guards.ts](../backend/src/domain/context.guards.ts)
- [backend/src/domain/context.recall.ts](../backend/src/domain/context.recall.ts)
- [backend/src/domain/context.relevance.ts](../backend/src/domain/context.relevance.ts)
- [backend/src/domain/context.retrieval.ts](../backend/src/domain/context.retrieval.ts)
- [backend/src/domain/conversation.context.ts](../backend/src/domain/conversation.context.ts)
- [backend/src/domain/conversation.focus.ts](../backend/src/domain/conversation.focus.ts)
- [backend/src/domain/conversation.processor.ts](../backend/src/domain/conversation.processor.ts)
- [backend/src/domain/inbox.processor.ts](../backend/src/domain/inbox.processor.ts)
- [backend/src/domain/interpretation.validation.ts](../backend/src/domain/interpretation.validation.ts)
- [backend/src/domain/notes.ts](../backend/src/domain/notes.ts)
- [backend/src/prompts/secretary.prompt.ts](../backend/src/prompts/secretary.prompt.ts)
- [backend/src/services/whatsapp-template.service.ts](../backend/src/services/whatsapp-template.service.ts)
- [backend/src/services/whatsapp.sender.ts](../backend/src/services/whatsapp.sender.ts)
- [backend/src/types/ai.types.ts](../backend/src/types/ai.types.ts)
- [backend/test/context-memory.integration.cjs](../backend/test/context-memory.integration.cjs)
- [backend/test/context-memory.test.cjs](../backend/test/context-memory.test.cjs)
- [backend/test/integration.cjs](../backend/test/integration.cjs)
- [backend/test/run.cjs](../backend/test/run.cjs)
- [backend/test/whatsapp-template.test.cjs](../backend/test/whatsapp-template.test.cjs)
- [docs/ARQUITETURA_ATUAL.md](../docs/ARQUITETURA_ATUAL.md)
- [docs/DECISOES_TECNICAS.md](../docs/DECISOES_TECNICAS.md)
- [docs/DEPLOY_BETA_COORDENADO.md](../docs/DEPLOY_BETA_COORDENADO.md)
- [docs/MAPA_CAPACIDADES.md](../docs/MAPA_CAPACIDADES.md)
- [docs/MEMORIA_CONTEXTUAL.md](../docs/MEMORIA_CONTEXTUAL.md)
- [docs/MISSAO_03.md](../docs/MISSAO_03.md)
- [docs/PLANO_BETA.md](../docs/PLANO_BETA.md)
- [docs/README.md](../docs/README.md)
- [docs/ROADMAP.md](../docs/ROADMAP.md)
