# Avaliação controlada da inteligência e prontidão do beta — 28/10/2026

**Resultado: os oito cenários obtiveram aprovação nos resultados mais recentes,
após correções. Isso não libera o beta nem autoriza deploy.** Foram duas rodadas
completas e uma repetição focal, totalizando 17 chamadas e **US$ 0,0653804**
estimados, dentro dos US$ 0,10 autorizados. Saldo não utilizado: US$ 0,0346196.

Branch: `codex/dev-beta-reliability-20261028`, sobre `f9db473`.
Interpretações integrais, expectativas, fixtures, métricas, revisões e hashes dos
pacotes executados: [evidência JSON](evidence/context-memory-openai-20261028.json).
Nenhuma chamada adicional é necessária para ler ou revisar essa evidência.

## Execução e limites

- Configuração efetiva observada sem revelar valores secretos: `AI_MODE=openai`,
  `OPENAI_MODEL=gpt-4.1-mini`. Todas as respostas identificaram o snapshot
  **gpt-4.1-mini-2025-04-14**. Não houve troca de modelo ou fallback.
- A chave local disponível era anterior à rotação e **não foi usada**. O conector
  oculta valores. O código atual de desenvolvimento foi compilado em um pacote
  diagnóstico e executado somente em memória numa sessão autenticada do console,
  usando a credencial já existente internamente. Não houve cópia da chave,
  alteração de variáveis/configuração/arquivos da aplicação, reinício ou deploy.
  Variáveis temporárias do diagnóstico foram removidas da sessão ao terminar.
- Só contexto fictício fixo, data 28/10/2026 12:00Z e fuso America/Sao_Paulo.
  Nenhum dado de usuário foi consultado. Nenhum executor, cliente de banco,
  fila ou remetente WhatsApp foi invocado; nenhuma migração foi executada.
- Responses API, `store:false`, temperatura 0,2, máximo 1.200 tokens de saída,
  timeout 28s, retries do SDK desativados. O limite de saída do provedor no produto
  é 2.800: não confundir estas amostras com todas as condições de produção.
- Cada cenário foi solicitado ao modelo, mesmo quando o parser de produção
  normalmente dispensa IA. Registramos saída bruta, interpretação validada e
  interpretação após `prepareConversation`. `old_employment` continua resolvido
  pelo comando determinístico no produto; esse desvio está explícito na evidência.
- O orçamento reserva antes da chamada um teto por bytes UTF-8 + margem de
  enquadramento + saída máxima, sem supor desconto de cache. Uso conhecido libera
  a reserva e debita o custo estimado. Uso/custo desconhecido ou falha de provedor
  interrompe chamadas, conservando a reserva incerta. Repetições carregam o total
  anterior em `spentUsd`; nenhum orçamento foi reiniciado entre rodadas.

O primeiro envio do pacote excedeu o limite do console antes da avaliação;
reconectamos e transferimos blocos com verificação SHA-256. Esse problema de
transporte não é uma tentativa ao provedor. As 17 chamadas efetivas estão todas
contabilizadas, sem uso desconhecido.

## Falhas, investigação e correções

As saídas originais foram preservadas. A coluna de revisão aplica os critérios
completos, incluindo problemas descobertos ao ler o conteúdo, sem apagar o
resultado automático inicial.

| Rodada | Execução | Resultado automático original | Resultado após revisão completa |
|---|---|---|---|
| 1 | Oito cenários | 6/8 | 4/8 |
| 2 | Oito cenários, após corrigir contrato/prompt | 8/8 | 7/8 |
| 3 | Apenas conselho sobre entrevista | 1/1 | 1/1 |

Problemas reais encontrados:

1. **Consulta de emprego:** retornou `recall_personal` sem `reply`, rejeitado pelo
   parser. O prompt introduzia `recall_context` no texto, mas omitia essa action
   e `assistant_plan` do enum principal. Corrigimos o enum e explicitamos que toda
   action de consulta exige `reply` não vazio. Não relaxamos o parser para aceitar
   respostas incompletas.
2. **Preferência:** respondeu o fato como `conversation`, em vez de usar consulta
   com fonte atual. Esclarecemos a diferença entre recuperação contextual por
   significado e o fluxo antigo de memória pessoal; perguntas factuais sobre
   preferências devem usar `recall_context`.
3. **Correção de horário:** a identidade e a data estavam corretas, mas o modelo
   escreveu “Alterei para as 16h” antes de executar. O verificador inicial não
   reconhecia esse verbo; corrigimos o critério e a instrução de resposta. O
   servidor gera a confirmação real após executar, mas antecipar sucesso também
   foi considerado falha de interpretação.
4. **Conselho pouco útil:** nas duas primeiras rodadas, citava a entrevista técnica
   e perguntava se o usuário queria ajuda. Isso satisfazia o contrato mínimo, mas
   não entregava a orientação pedida. Exigimos conselho concreto quando o assunto
   já está identificado, sem escolher entre assuntos ambíguos. Na repetição,
   recomendou revisar conceitos, praticar problemas e preparar exemplos de projetos.

Também removemos a instrução conflitante de “um pedido por mensagem” que contrariava
o plano composto revisável. O avaliador agora preserva métricas completas, permite
repetição focal e testa limites, erros, JSON inválido e separação entre modelo e
guardas. Não houve reescrita da arquitetura, mudança de executores ou migração.

## Resultado mais recente de cada cenário

Modelo em todas as linhas: **gpt-4.1-mini-2025-04-14**. Cache informado: **0 tokens**.
Tokens são os números retornados pelo provedor, não estimados pelo tamanho do texto.
Aprovação exige interpretação bruta e resultado após guardas compatíveis com o
contrato; também houve revisão do conteúdo. Todos os resultados originais estão no JSON.

| Cenário | Esperado e interpretação observada | Rodada / resultado | Entrada / saída | Latência | USD estimados |
|---|---|---|---|---|---|
| `old_employment` | Consultar a área de trabalho registrada. Modelo: `recall_context`, search “área de trabalho”; servidor: consulta determinística, sem executar gravação. | 2 / aprovado | 9.560 / 28 | 1.892 ms | 0,0038688 |
| `interview_advice` | Conselho sobre entrevista técnica de software. `conversation`: revisar conceitos, praticar problemas e preparar exemplos; sexta às 10h corresponde ao registro 30/10 13Z. Sem criar ações. | 3 / aprovado | 9.655 / 68 | 1.276 ms | 0,0039708 |
| `ambiguous_interview` | Perguntar qual entrevista. `conversation` nomeia Alfa e Beta e pede a escolha; não seleciona nem inventa detalhes. | 2 / aprovado | 9.527 / 35 | 1.112 ms | 0,0038668 |
| `current_correction` | Reagendar o mesmo registro. `reschedule_appointment`, fixture-meeting, 30/10 19Z = 16h local; guarda anexa versão 3. Nenhuma confirmação antecipada. | 2 / aprovado | 9.591 / 48 | 1.365 ms | 0,0039132 |
| `correction_without_focus` | Identificar o alvo antes de mudar. `conversation` pergunta qual tarefa/compromisso; nenhuma criação ou seleção arbitrária. | 2 / aprovado | 9.483 / 26 | 1.354 ms | 0,0038348 |
| `multiple_requests` | Duas etapas revisáveis. `assistant_plan`: nota do portfólio + lembrete de revisão em 29/10 10h -03 (13Z), sem perder uma etapa. Nenhuma ação foi executada nesta avaliação. | 2 / aprovado | 9.501 / 91 | 2.170 ms | 0,0039460 |
| `preference` | Consultar preferência existente. `recall_context`, search “preferência de horário de reuniões”; sem responder como fato solto ou alterar preferências. | 2 / aprovado | 9.559 / 31 | 2.449 ms | 0,0038732 |
| `storage_opt_out` | Conversar sem armazenar. `conversation` oferece ajuda sobre emprego, sem memória, nota, fato ou plano de gravação. | 2 / aprovado | 9.487 / 35 | 1.043 ms | 0,0038508 |

**Limite da aprovação:** estes são os últimos resultados por cenário, não uma
terceira rodada completa com o prompt final. Sete resultados vêm da rodada 2 e o
conselho vem da rodada 3. A última adição ao prompt, sobre orientação concreta,
foi avaliada só no cenário afetado para preservar o orçamento. Dezessete amostras
não demonstram taxa estatística de acerto nem resistência geral a instruções maliciosas.

## Consumo total, incluindo falhas e repetições

| Rodada | Chamadas | USD estimados |
|---|---|---|
| 1 | 8 | 0,0303496 |
| 2 | 8 | 0,0310600 |
| 3 | 1 | 0,0039708 |
| **Total** | **17** | **0,0653804** |

Entrada: **160.339**; saída: **778**; total: **161.117 tokens conhecidos**.
Tabela usada: US$ 0,40/M entrada, US$ 0,10/M entrada em cache, US$ 1,60/M saída,
conforme [documentação oficial do modelo](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
Estimativa de texto da API, não fatura: não inclui infraestrutura, câmbio ou impostos.

## Testes locais e arquivos alterados

- `node test/run.cjs`: **285/285**, incluindo oito testes novos do avaliador.
- `INBOX_TEST_DATABASE_URL=<banco local *_test> node scripts/check-pilot.cjs --integration`:
  typecheck, unitários e **331/331 integrações**, em aproximadamente 147s nas
  integrações. Credenciais externas removidas pelo script; provedores simulados.
- `node node_modules/typescript/bin/tsc`: **build final aprovado**. Após o último
  ajuste de orientação/ledger, repetimos unitários e build; a integração não foi
  repetida porque não houve alteração de persistência, execução ou contratos de DB.
- Dry-run do avaliador: lista os oito cenários, zero chamadas/escritas/envios.
- Casos do avaliador: orçamento acumulado e bloqueio antes da chamada, uso
  desconhecido, erro 429 sem retry nem vazamento de mensagem, custo acima da reserva,
  saída inválida contabilizada, modelo sem preço, consulta que dispensa IA no produto,
  alvo/fuso incorretos, ação perdida, sucesso antecipado, conselho superficial e repetição focal.

Código: `backend/scripts/evaluate-context-memory.cjs`, novo
`backend/scripts/lib/context-memory-evaluation.cjs`,
`backend/src/prompts/secretary.prompt.ts`, novo
`backend/test/context-memory-evaluation.test.cjs` e `backend/test/run.cjs`.
Documentação/evidência: este relatório, JSON anexo, `PLANO_BETA.md`,
`MISSAO_03.md`, `ROADMAP.md` e `backend/NEXT-SESSION.md`.

## Prontidão: o que está comprovado

- Modelo configurado e snapshot realmente utilizado; JSON, ações, alvos,
  datas/fuso, planos sem perda de etapas, recusa de armazenamento e esclarecimento
  de ambiguidade nos oito exemplos controlados.
- A consulta antiga é separada de uma escrita; a versão de correção vem do estado
  atual, não de um número inventado pelo modelo. O conselho útil foi observado
  na repetição focal, com as limitações de amostragem acima.
- Nos testes locais com banco isolado: recuperação ao longo de sessões, origem,
  consentimento/revogação, exclusão sem ressuscitar texto, isolamento por contato
  e conta, foco entregue/único, mudança de versão e proposta antes da execução.
- Os testes de confiabilidade existentes continuam aprovados, incluindo erros de
  template, retentativas confirmadas e preservação de estado incerto. São testes
  com provedores simulados, não prova de entrega da Meta.

## O que ainda depende de integração real

- Recuperação do banco e montagem do contexto **junto** com o modelo e as respostas
  WhatsApp na nova release. Aqui o modelo recebeu contexto fictício fornecido;
  nenhuma recuperação real do usuário nem execução foi feita.
- Consentimento do participante, contexto individual separado, consulta/correção/
  exclusão entre dias e resposta com origem, na interface que ele usará.
- Template de lembrete na WABA correta, status APPROVED/UTILITY, idioma, corpo,
  permissões e parâmetros reais; entrega fora da janela de atendimento com recibo.
- Falha/reinício/retomada do sistema hospedado, observabilidade operacional e
  recuperação de backlog sem duplicar efeitos externos.
- Backup e restauração exercitados em destino isolado compatível com PostgreSQL 18
  hospedado. O banco de integração local não prova recuperabilidade da Railway.

## O que impede um deploy seguro neste momento

1. **Autorização de deploy ausente nesta etapa.** Só GitHub em desenvolvimento foi autorizado.
2. Backup/restauração e plano de contenção/recuperação ainda sem ensaio demonstrado.
3. Migração aditiva de `e920084` ainda exige publicação coordenada. Workers antigos
   não entendem `delivery_retry`; parser antigo não entende `recall_context`.
   Evitar mistura de versões e rollback cego com backlog incompatível.
4. Sem comprovação de template fora da janela, o escopo de lembretes irrestritos
   continua bloqueado, mesmo com interpretação e testes locais aprovados.

Seguir [DEPLOY_BETA_COORDENADO.md](DEPLOY_BETA_COORDENADO.md). Estes bloqueios
não são resolvidos por “cinco serviços online” nem pela contagem de testes.

## Antes de convidar o primeiro participante

1. Revisar esta entrega e definir SHA de release/escopo; concluir backup/restauro,
   compatibilidade e operação de contenção antes de pedir autorização concreta de deploy.
2. Após autorização, publicar a mesma release nos três serviços, aplicar apenas a
   migração prevista, verificar schema/readiness e observar o backlog.
3. Com Pedro e autorização de envio, demonstrar no WhatsApp uma jornada completa:
   memória consentida → retomada → conselho útil → plano revisado/confirmado →
   alteração/cancelamento, verificando registro, versão e resposta entregue.
4. Demonstrar um lembrete fora da janela com template real e recibo, além do caminho
   de falha/estado incerto. Sem isso, restringir e explicar o escopo disponível.
5. Preparar elegibilidade do número do participante na Meta, fuso, consentimentos
   próprios, instruções de pausa/exclusão, limites e contato de suporte; verificar
   isolamento real entre Pedro e participante.
6. Convidar para uso acompanhado por alguns dias, medindo acertos por jornada,
   repetição de perguntas, alterações erradas, avisos entregues, custo e ajuda necessária.

A meta de 04/11 é uma direção; esta avaliação reduz uma lacuna de inteligência,
mas não comprova prontidão operacional do beta nem atendimento de qualquer pedido.

Produção continua em `codex/railway-ready-20261020` (`a072f63`). Deploys conferidos:
API `6ab19165-f02d-454a-b181-729dd5de3cd7`, inbox
`1150569b-927b-472d-b64b-94a65e508c32`, lembretes
`614ab584-6b70-4083-81d6-f0fb781dba11`. Nenhuma alteração staged ou deploy solicitado.
