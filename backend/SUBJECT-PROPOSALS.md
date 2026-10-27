# Propostas de atualização de assunto — 27/10/2026

Implementação local, ainda não publicada. Usa Event e os modelos existentes;
não acrescenta migração além de SubjectPending, criada na etapa anterior.

## Primeiro fluxo composto

Para um cliente/projeto já cadastrado:

“Atualiza o projeto Avenida Beira Rio: o contrato ainda não foi assinado;
cria a pendência Assinatura do contrato, aguardando Evandro. Próxima ação:
cobrar retorno sobre a assinatura.”

1. A interpretação propose_subject_update identifica assunto, um campo factual
   e uma nova pendência sem prazo. A resposta é uma proposta explícita, não uma
   confirmação de registro. O projeto e a pendência ainda não são alterados.
2. O usuário vê a informação, título da pendência, pessoa aguardada e próxima
   ação. Confirma por texto: CONFIRMAR ATUALIZAÇÃO. Para recusar: DESCARTAR
   ATUALIZAÇÃO. “Sim”, “ok”, uma pergunta ou um documento não confirmam.
3. O servidor recupera a proposta persistida; não usa argumentos novos da IA
   na confirmação. Confere contato/conta, envio aceito pelo provedor, última
   resposta, validade de 15 minutos, versão do campo factual e duplicação da
   pendência. Uma nova proposta substitui a anterior.
4. Informação e pendência são gravadas dentro da transação de execução do inbox.
   A informação conserva revisões; ambas usam a mensagem original como origem.
   A proposta guarda o ID da mensagem de confirmação e os registros resultantes.
5. Um savepoint reverte a primeira parte se um executor recusar a segunda
   (por exemplo, por cota). Erros inesperados propagam para o rollback/retry da
   transação externa. Falha ao gravar a resposta também desfaz as alterações.
6. A confirmação é consumida uma vez. Outra mensagem de confirmação não repete
   efeitos. Após resposta aceita da aplicação, a conversa mantém o projeto em
   foco por meio do evento de aplicação, não por um ID inventado pelo modelo.

## Controles

- Proposta só vale depois de sua resposta ser aceita pelo provedor. Isso não
  comprova leitura ou entrega; a confirmação explícita continua necessária.
- Confirmação/descarte são reconhecidos por parser determinístico e dispensam
  IA/contexto; continuam disponíveis quando a cota de interpretação acaba.
- Nome explícito do assunto na origem; cadastros ambíguos pedem esclarecimento.
- Campo factual e pendência limitados aos tamanhos já suportados pelos domínios.
- Quem se aguarda deve constar na mensagem; não inventar interlocutor.
- Pedido com data/prazo/aviso pede esclarecimento, não perde o horário nem cria
  lembrete silenciosamente. Novas pendências só começam pending ou waiting.
- Fala “contrato não assinado” pode ser informação válida; a confirmação
  autoriza a criação da pendência associada apesar dessa negação factual. O
  bypass interno não é campo de interpretação aceito da IA. “Não registre”
  impede a preparação da proposta.
- Consultas usam o estado persistido; proposta sozinha não vira fato/decisão.
- A exclusão de conteúdo existente remove os eventos da conta, dados e cadastros
  associados; outro contato/conta não pode confirmar ou consultar a proposta.

## Limites

Um campo factual e uma nova pendência por proposta. Não altera uma pendência
existente, não encerra outras automaticamente e não executa cobranças externas.
Propostas expiradas/substituídas precisam ser refeitas, não reativadas por “sim”.
Formato de confirmação é intencionalmente explícito nesta etapa; confirmação
conversacional com referência inequívoca/botões é uma evolução a avaliar.

Não substitui validação institucional, parecer ou decisão formal. Dados reais
de prefeitura não fazem parte da validação local. Avaliação com interpretação
real de IA e WhatsApp continua pendente, distinta das simulações automatizadas.

## Validação desta entrega

- TypeScript e 244 testes unitários aprovados.
- Suíte completa de 255 integrações PostgreSQL aprovada, com provedores simulados.
- Inclui 12 cenários de proposta: sem gravação antecipada, confirmação, descarte,
  reentrega, concorrência, expiração, envio não aceito, outro contato/conta,
  campo alterado, pendência duplicada, cota, rollback e fluxo inbox em dois turnos.
- Cota esgotada não bloqueia a confirmação controlada; ela não consulta a IA.
- Imagem secretaria-ia:subject-proposal-release-20261027 construída; smoke do
  módulo compilado e cliente Prisma aprovado, Node24.22.1 e usuário1000, sem
  conectar a banco, usar credenciais ou enviar mensagens.
- Logs subject-proposal-* na workspace. Nenhum push, deploy ou migração de
  produção realizado nesta entrega. Produção permanece em fe88705.
