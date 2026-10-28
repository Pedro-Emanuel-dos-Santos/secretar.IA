# Continuidade de pendências por retorno — 27/10/2026

Publicado e confirmado no WhatsApp em27/10/2026, código21648b1. Não acrescenta
tabela/migração. API, inbox e lembretes Active; readiness ready.

Teste real com prefixo de projeto: mesma pendência do Piloto, versão0→1,
waiting→pending, waitingFor nulo, próxima ação revisar o contrato. Auditoria
preservou a espera pelo Evandro e a próxima ação anteriores. Fatos do projeto
inalterados, uma única pendência, resposta aceita/lida e nenhuma chamada IA
para essa mensagem. A confirmação vale para esse cenário, não para linguagem
natural irrestrita. Registro operacional: work/pending-followup-release-20261027.md
na workspace de continuidade.

## Experiência

Depois de consultar um projeto com uma pendência aguardando Evandro:

“O Evandro respondeu, agora falta revisar o contrato.”

O servidor retoma a pendência única daquele projeto aguardando Evandro, muda
waiting→pending, limpa waitingFor e guarda “revisar o contrato” como próxima ação.
O ID, título e origem de criação permanecem. O evento de alteração conserva a
espera e próxima ação anteriores e aponta à nova mensagem. Não altera fatos,
não presume contrato assinado, não conclui a pendência e não cria lembrete.

Também aceita “retornou”/“deu retorno” e “agora preciso/vou/vamos…”. A próxima
ação é extraída literalmente, com verbo no infinitivo e até300 caracteres.
Não é um interpretador geral de qualquer relato ou autorização para ação externa.

Sem contexto recente, pode dizer explicitamente:

“No projeto Piloto, o Evandro respondeu; agora falta revisar o contrato.”

O prefixo “No projeto NOME,” ou “No cliente NOME,” exige o nome exato cadastrado.
Sem prefixo, o foco recente vale até30 minutos, só após resposta aceita pelo
provedor, no mesmo contato/conta. Consulta por pronome preserva o foco anterior;
confirmação aplicada usa o evento de auditoria para recuperar o assunto.

## Seleção e execução

- Consultar todas as pendências aguardando do assunto, até101 para detectar
  truncamento. Só selecionar se a pessoa nomeada tiver uma correspondência única.
- Duas pendências aguardando a mesma pessoa pedem esclarecimento. Nenhum alvo
  é escolhido pela posição de uma lista ou por semelhança entre títulos.
- Não procurar pela pessoa em projetos alheios ao assunto. Outro contato/conta,
  foco não confirmado, expirado, ambíguo ou interrompido não autoriza atualização.
- O padrão seguro é resolvido antes da IA; não depende de o modelo escolher
  update_subject_pending em vez de criar outra tarefa. subjectPendingId e versão
  são controles internos; IDs sugeridos pela IA são removidos.
- O executor resolve novamente referência, escopo, pessoa, próxima ação e versão.
  Atualização concorrente impede sobrescrita. Um ID forjado não basta.
- Escrita e auditoria seguem a transação do inbox. Reentrega é idempotente;
  rollback preserva a posição anterior. Após resposta aceita, mantém o projeto
  em foco por evento auditado para a próxima consulta.
- Perguntas, negações, condicionais e pedidos com prazo/aviso não são executados
  automaticamente por esse atalho; pedem esclarecimento.

## Limites

O relato de que alguém respondeu vem do usuário, não da identidade autenticada
da pessoa citada. Não registra automaticamente um novo fato ou uma decisão formal.
Não renomeia a pendência nem mostra toda a auditoria por conversa nesta entrega.
Formas de relato fora dos padrões suportados ainda passam pela interpretação
normal e podem exigir assunto/título explícitos. Não prometer compreensão irrestrita.

Validação: suíte completa de264 integrações aprovada; onze integrações afetadas
repetidas/aprovadas na revisão final, incluindo dois casos novos de projeto
explícito. Dois testes unitários dedicados e TypeScript aprovados. A suíte
completa inclui os nove casos iniciais de continuidade; a repetição de onze não
deve ser somada como onze testes distintos adicionais.
Suíte unitária completa:246 aprovados. Imagem local
secretaria-ia:pending-followup-release-20261027 construída e smoke do módulo
compilado aprovado com prefixo de projeto explícito, Node24.22.1/UID1000, sem
banco ou mensagem real. Logs pending-followup-* na workspace. Publicação e teste
real posteriores foram confirmados conforme o registro no início deste documento.
