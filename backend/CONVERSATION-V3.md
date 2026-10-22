# Continuidade da conversa — 22/10/2026

Atualização local após a publicação 1798ff2. Não exige migração nem troca de
callback. Ainda não publicada ou avaliada com IA/WhatsApp reais.

## O que muda

- Um único foco recente entre tarefa e compromisso, recuperado do banco e
  confirmado por uma resposta aceita pelo provedor. Expira em 30 minutos.
  Conversa breve conserva o foco; listas e operações em outro assunto o encerram.
  Resposta pendente/incerta, item encerrado ou ID de outra pessoa/conta não
  ressuscitam um alvo anterior. Rascunhos conservam a janela própria de sete dias.
- O alvo é consultado pelo ID com escopo de contato/conta, mesmo fora dos doze
  próximos itens do contexto. Somente os campos necessários vão à IA; compromisso
  em foco inclui seus avisos ativos para não perder intervalos fora da prévia.
- Comandos curtos como “cancela essa tarefa”, “conclui esse lembrete” e “muda
  aquela reunião para às dez” usam o foco compatível. ID inventado pelo modelo
  não troca o alvo. Sem referência única, a aplicação pergunta. Seleção explícita
  de lista e pedido incompleto têm precedência. Alterações usam a versão lida.
- “O último” e “o penúltimo” são posições da lista de tarefas enviada, com os
  mesmos limites de validade, escopo e revalidação dos ordinais. Sem verbo,
  selecionam sem concluir. Não significam ordem de criação nem lista de reuniões.
- “Passa para quinta de manhã” mantém o item sem alterar seu horário e pergunta
  somente a hora. “Às nove” completa a quinta guardada, em vez de voltar ao dia
  antigo. Isso funciona para tarefas e compromissos e preserva o fuso.

## Limites e roteiro real

A linguagem continua sendo interpretada pelo modelo; as recuperações locais
cobrem comandos curtos específicos. Não equivalem a entendimento irrestrito.
Uma pergunta/negação sobre referência curta não autoriza alteração automática.
Título adicional, referência ambígua ou vários pedidos exigem interpretação ou
esclarecimento. “O último que criei” não é resolvido pela posição da lista.

Depois de publicar, testar em conversa autorizada:

1. Criar reunião e depois tarefa; “melhor amanhã” deve mudar só a tarefa.
2. “Muda essa tarefa para quinta de manhã” → “às nove”: conferir quinta às 09:00.
3. Listar tarefas; “o penúltimo” → “pode concluir”: somente aquele item.
4. Listar de novo e cancelar “o último”: somente o último da lista apresentada.
5. Trocar de assunto e depois dizer “cancela essa”: deve pedir qual item.
6. Criar reunião, depois “muda aquela reunião para às dez”: mesmo dia e avisos.

Não usar itens reais importantes nesse roteiro. Testes automatizados usam
contatos/dados fictícios em PostgreSQL local isolado e envio simulado.

## Verificação concluída

- Build e TypeScript aprovados.
- 199 testes unitários aprovados na revisão final.
- Suíte completa de 197 integrações aprovada; após refinamentos dos campos de
  foco e dias ambíguos, 13 integrações diretamente afetadas foram repetidas e
  passaram. O ajuste final de preservação dos avisos passou nos unitários/build.
- Logs na workspace: conversation-v3-final.log, conversation-v3-unit.log e
  conversation-v3-targeted-final.log. Nenhuma chamada real aos provedores.
