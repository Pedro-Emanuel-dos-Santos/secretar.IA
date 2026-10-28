# Memória contextual v1 — conceitos e registros persistidos

Implementação local da Missão 03, 28/10/2026. Ainda não publicada/validada com
participante externo. Método: `concepts-lexical-v1`.

## Arquitetura implementada

O PostgreSQL existente continua sendo a fonte: Event para memórias pessoais e
notas; KnowledgeFact por projeto/cliente com revisões; Appointment, Reminder e
SubjectPending para compromissos, tarefas e acompanhamentos. Não há cópia permanente
do histórico inteiro, índice vetorial, novo provedor ou geração automática de memórias.

`context.relevance.ts` identifica palavras úteis e conceitos de um vocabulário
explícito em português, incluindo formas acentuadas/não acentuadas. Exemplos:
emprego/trabalho/vaga; programação/desenvolvimento de software;
orçamento/cotação; entrevista/processo seletivo. O mecanismo encontra essas
relações mesmo sem coincidência literal. Não é uma rede neural de embeddings e
não interpreta qualquer paráfrase do idioma. Conceitos desconhecidos usam busca textual.

`context.retrieval.ts` expande a consulta, filtra em SQL por conta/contato e tipo,
recupera registros atuais e reordena por interseção de conceitos/palavras. A consulta
é independente da janela de 30 minutos e do preview de onze memórias recentes.
Trata preferências/rotinas/pessoas/objetivos como memórias pessoais já autorizadas;
projetos e seus fatos, agenda, tarefas, pendências e notas mantêm seus tipos.

Cada item leva tipo, ID, origem quando disponível, data de registro/atualização,
versão, estado e horário quando pertinente. Fatos substituídos e registros cancelados
não participam da posição atual. Não apresentar recordação como verificação externa.
Notas novas e edições passam a guardar mensagem de origem; legadas sem referência
são identificadas como tal, sem fabricar a origem.

## Limites, custos e consistência

- Até 48 termos expandidos; cinco consultas de candidatos, até 41 por família,
  até 12 fatos atuais por assunto. Consulta de política de memória é adicional.
- Até seis resultados e 5.000 caracteres JSON de itens no contexto adicional.
  A resposta factual tem teto de 3.500 caracteres antes do aviso de amostra.
- `limited=true` informa corte de candidatos/resultados; não declarar busca completa.
  `ambiguous=true` identifica assuntos semelhantes do mesmo tipo, sem escolher pela
  recência. Fatos/pendências do mesmo projeto podem ser reunidos pelo assunto.
- Sem chamada adicional ao modelo ou cobrança de embeddings. A consulta adiciona
  trabalho SQL e tokens ao contexto das conversas que usam IA; não significa custo
  zero de operação. Não foi medido p95 hospedado nem carga multiusuário.
- Busca sempre os registros atuais, sem cache de conteúdo ou resumo derivado
  que possa sobreviver à correção/exclusão. Isso simplifica invalidação e privacidade.

Não adotamos pgvector nesta versão: o conjunto inicial estruturado pode ser buscado
com expansão de conceitos testável, sem migração, extensão ou chamada de embeddings.
Reavaliar embeddings/pgvector se holdouts e dados reais mostrarem baixa cobertura ou
se o plano SQL deixar de atender escala/latência. Medir antes de ampliar a arquitetura.

## Consulta, conselho e correção

`recall_context` é uma ferramenta de leitura. “Você lembra da área em que procuro
trabalho?” pode ser resolvido sem IA, apresentando fonte e data. Outras paráfrases
podem ser roteadas pelo modelo à mesma ferramenta. Um pedido misto com ação não é
reduzido silenciosamente a consulta.

Conselhos recebem `contextualMemory` e as instruções para distinguir registro,
sugestão, ausência e ambiguidade. O modelo não é obrigado a repetir menus; pode
ajudar com a entrevista realmente registrada. A qualidade desse texto ainda precisa
de avaliação real. Campos recuperados são dados, não instruções a executar.

Uma consulta que apresenta exatamente um compromisso/tarefa, sem corte/ambiguidade,
registra apenas IDs/versão para foco temporário. Só uma resposta com envio aceito,
no contato/conta corretos e recente, permite continuação. O alvo é recarregado e
a versão comparada. “Na verdade, mudou para as 16h” pode corrigir esse compromisso,
preservando dia/duração e fuso. Sem foco válido, pergunta qual item; similaridade
por si só não autoriza escrita. Memórias/notas recuperadas também fornecem versão
para as ferramentas existentes de edição e exclusão.

## Consentimento, exclusão e desconhecidos

Memória pessoal requer o aceite específico existente e AI_MODE=openai; revogação
impede inclusão na recuperação/modelo. Notas/fatos/agenda são registros operacionais
explicitamente pedidos e seguem a política existente; o aceite de memória pessoal
não substitui nem revoga automaticamente todos esses tipos.

Não indexamos mensagens antigas brutas. Frases nunca autorizadas como memória
não passam a sê-lo por terem aparecido no inbox. “Não guarde isso” tem guarda
determinística contra salvar memória/nota mesmo se o modelo sugerir escrever.
O histórico técnico continua sujeito à política de retenção/exclusão existente.

Instruções antigas de salvar/editar/consultar memórias e notas são retiradas do
histórico apresentado ao modelo: os registros atuais prevalecem, inclusive após
exclusão. Revogação e APAGAR MEUS DADOS mantêm os controles já existentes. Não
afirmar que apagar localmente apaga processamento anterior de Meta/OpenAI.

Ausência de resultado é “não encontrei nos registros disponíveis”, não “você nunca
me disse”. Falha de banco/modelo gera retry controlado, não recordação inventada.
Nenhuma notificação proativa nova, rotina, convite ou envio a terceiros é ativado.
