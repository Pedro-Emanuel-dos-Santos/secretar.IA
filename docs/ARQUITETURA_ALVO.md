# Arquitetura evolutiva proposta

Status: proposta para revisão, 28/10/2026. Sem reescrita geral ou mudança remota.
Manter o backend modular, PostgreSQL como fonte dos registros, inbox/outboxes e
workers atuais. Não criar microserviços, banco vetorial ou framework de agentes
apenas por antecipação de escala.

## Componentes e evolução incremental

1. **Contexto e memória:** preservar fatos, notas, consentimentos e proveniência.
   Acrescentar recuperação por assunto que una projeto, pessoa, pendências e última
   decisão confirmada. Consultar antes de responder e marcar amostras incompletas.
   Resumo persistido deve citar fontes/revisões e ser invalidado por correção ou
   exclusão. Não tratar resumo gerado como nova verdade. Só avaliar busca semântica
   se a busca lexical medida não atingir os casos do beta.
2. **Interpretação e planejamento:** modelo propõe intenções e ferramentas
   permitidas; servidor resolve IDs, versões, datas e lacunas. Evoluir a composição
   de ações por jornadas aprovadas. Conselhos e sugestões não viram ações sem a
   autorização correspondente. Manter validação de origem e propostas revisáveis.
3. **Execução:** reaproveitar transações, savepoints, ledger e outboxes. Diferenciar
   proposta, registro, agendamento, envio aceito, entregue, falho e incerto. Permitir
   reparação operacional explícita em vez de repetir efeitos externos às cegas.
4. **Proatividade:** começar pelo resumo já existente. Próxima política opt-in
   deve definir finalidade, horário, frequência, limite e pausa; gerar sugestão
   fundamentada no que está registrado, sem inferir urgência de item sem prazo.
5. **Personalização:** consentimento por contato/conta/provedor, preferências
   editáveis e uma resposta coerente com os registros atuais. Não duplicar a mesma
   regra em vários textos de prompt; contratos e guardas precisam concordar.
6. **Segurança e operação:** manter escopo de dados em todas as ferramentas;
   identidade de equipe só quando houver necessidade compartilhada real. Incluir
   evidência de configuração, alertas, ensaio de recuperação e exclusão do beta.

## Proposta de roteamento por qualidade e disponibilidade

Para o beta, recomendar **OpenAI como principal configurado explicitamente** e
Ollama adiado até existir endpoint hospedado acessível e avaliado. Isso evita
introduzir dependência do computador de Pedro. Não é uma alteração já aprovada
nem uma estimativa de preço. Também preserva o consentimento atual, vinculado
ao provedor OpenAI. Investigar modo/modelo efetivos antes de qualquer mudança.

No roteador futuro:

- Classificar tarefa por metadados explícitos e pedido atual, não por comprimento
  do JSON de contexto; manter comandos determinísticos que já funcionam.
- Registrar seleção, motivo, disponibilidade e tentativas; observar p50/p95,
  taxa de falha e qualidade por jornada, não só tokens.
- Provedor local só entra quando passar o mesmo conjunto de avaliação e quando
  seu custo de infraestrutura e latência fizerem sentido. Adicionar circuito de
  indisponibilidade para não repetir timeout local a cada pedido.
- Fallback tem provedor permitido, consentimento compatível, timeout total e
  política de custo explícitos. Não reexecutar uma ação para tentar outro modelo.
- Token ausente permanece desconhecido. Estimativa financeira usa tabela datada
  e versionada, modelo e tokens informados, distinguindo cache; não é fatura real.

## Contratos antes de abstrações novas

Cada ferramenta deve declarar entradas, escopo, validação, necessidade de
confirmação, efeito e resultado persistido. O código de domínio existente pode
implementar esses contratos; um “agente geral” com permissões irrestritas não é
pré-requisito. Integrar Google Agenda só com OAuth por usuário, revogação,
deduplicação, conflitos e recuperação demonstrados.

## Próxima implementação proposta

Configuração e observabilidade de IA verificáveis: separar decisão de rota de
chamada ao provedor, registrar motivo e fallback e testar a heurística contra
contextos grandes com pedidos simples. Mudança deve preservar política de memória
e não mudar provedor de produção automaticamente. Ver decisões e roadmap.
