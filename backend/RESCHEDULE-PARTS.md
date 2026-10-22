# Reagendamento parcial na conversa

Incremento local, sem publicação, troca de callback ou migração.

- “Passa para quinta” preserva a hora local da tarefa/compromisso identificado.
- “Melhor às dez” preserva o dia salvo, mesmo se o modelo sugerir outro dia.
- “Amanhã”, “hoje”, “depois de amanhã” e dia da semana simples são resolvidos
  a partir do recebimento da mensagem e do fuso do contato.
- Dia da semana simples significa a próxima ocorrência; se for o mesmo dia
  da mensagem, vai para a semana seguinte. Qualificadores como “da outra semana”
  usam a data interpretada pelo modelo, mantendo a hora original.
- Pedidos com dia e hora explícitos seguem a interpretação completa existente.
- Duração relativa conserva o comportamento baseado no recebimento da mensagem.

Sem alvo único disponível no contexto, não copia horário de outra tarefa. Período
vago (“quinta de manhã”), horário local inexistente ou ambíguo pede informação
em vez de alterar. O executor continua recusando horário passado.

Partes preservadas usam a versão do registro consultado. Tarefas conferem a
versão de agendamento; compromissos conferem a versão após bloquear e reler a
linha. Assim, uma interpretação antiga não sobrescreve uma mudança concorrente.
Reagendar compromisso conserva os intervalos dos avisos pelo fluxo existente.

Validação: build/TypeScript, 153 unitários e suíte com 167 integrações passaram.
As dez verificações unitárias novas cobrem partes omitidas, datas faladas, fuso,
horário de verão, alvo ausente, período vago e duração relativa. Quatro integrações
cobrem execução real no banco, idempotência, avisos e versão concorrente.
Provedores simulados; falta avaliar interpretação com IA real e teste no WhatsApp.

Limites: o servidor não substitui toda a interpretação de linguagem temporal.
Dia/hora completos e datas com qualificadores complexos ainda dependem do modelo.
Seleção do alvo também precisa ser inequívoca; este incremento não escolhe entre
duas reuniões nem cria associações por aproximação.

# Correção curta de dia — 22/10

“Melhor amanhã” ou “na verdade, pra depois de amanhã” continuam o único item
ativo em foco, mesmo se a IA responder como conversa ou tentar criar outro.
O horário local e a proteção de versão do reagendamento são mantidos. Com dois
alvos possíveis, a resposta pede qual tarefa ou compromisso mudar; sem alvo,
pergunta o que passar para o dia. Um rascunho em andamento tem precedência.
Essa recuperação reconhece somente a frase completa, sem perguntas, negações
ou outro pedido no mesmo texto. Não escolhe um alvo pelo primeiro item da lista.

Validação: TypeScript e build aprovados, 188 testes unitários e 186 integrações
locais passaram. A nova integração usa contexto persistido, interpretação
simulada como conversa e confere horário, versão, outbox e ausência de duplicata.
Interpretação com IA real e WhatsApp ainda não avaliados para esta nova regra.
