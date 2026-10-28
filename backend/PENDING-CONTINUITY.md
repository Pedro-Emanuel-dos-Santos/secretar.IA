# Continuidade de uma pendência na conversa — 27/10/2026

Entrega validada localmente, em preparação para publicação. Sem migração ou
nova credencial. TypeScript,250 unitários e278 integrações na suíte completa
aprovados. Revisão final repetiu os sete cenários novos e onze de retorno,
mais os250 unitários. Não somar repetições como testes distintos.

O ciclo usa uma pendência já apresentada em resposta aceita pelo WhatsApp:

1. “O Evandro respondeu, agora falta revisar o contrato.”
2. “Já revisei, agora falta ele assinar.”
3. “Agora estou aguardando Maria.”
4. “Agora vou conferir o documento.”
5. “Já conferi, agora falta ela assinar.”
6. “Já assinou, pode concluir essa pendência.”

As etapas atualizam o mesmo ID. Estados, pessoa aguardada e próxima ação são
auditados com a posição anterior; a origem de criação permanece. Concluir uma
etapa não conclui a pendência. “Já assinou, pode concluir” encerra a pendência,
mas não atualiza automaticamente o fato cadastrado sobre assinatura do contrato.
Não é uma verificação externa nem decisão formal.

Referência dura30 minutos, isolada por contato/conta e vinculada ao último evento
de criação/alteração ou proposta efetivamente aplicada, com resposta aceita.
Leituras do mesmo projeto preservam o foco; outro assunto/operação, resposta
incerta, expiração ou versão diferente impedem alteração implícita. O pronome
retoma a pessoa identificada no evento, não um nome inventado pela IA.
Persistência em banco permite retomar após reinício; não depende da sessão Node.

O executor recalcula a referência e confere ID, versão, projeto, estado, próxima
ação e pessoa antes de escrever. O bloqueio/versionamento existente continua
protegendo concorrência. IDs produzidos pela IA continuam descartados. Replay é
idempotente e falha na transação desfaz registro e auditoria juntos.
Repetir a mesma posição preserva foco com evento subject_pending_focused,
sem incrementar versão nem criar alteração fictícia no histórico. Uma tarefa
com horário já selecionada conserva prioridade no próprio fluxo de confirmação.

Frases suportadas são resolvidas antes da IA, com resposta produzida pelo
executor. Perguntas, negações, prazo/aviso e pedidos compostos não usam o atalho.
Isso não promete entendimento irrestrito de qualquer texto. A ausência de foco
pede a pendência; pronome sem pessoa identificada pede quem está aguardando.

Arquivos principais: src/domain/pending.continuation.ts, subject.pending.ts,
conversation.context.ts e conversation.processor.ts. Testes: pending-continuation
unitários e integração com ciclo, reinício, confirmação aplicada, isolamento,
resposta incerta, concorrência, rollback, replay e inbox sem IA.
