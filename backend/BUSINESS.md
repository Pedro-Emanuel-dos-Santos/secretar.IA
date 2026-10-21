# Compromissos e memória de clientes

## Compromisso e aviso têm horários independentes

“Marca uma reunião com João amanhã” pergunta a hora. “Nove e meia da manhã” completa o pedido. “Me avisa meia hora antes” mantém a reunião às 9h30 e prepara o aviso às 9h. “Também na hora” acrescenta um segundo aviso. “Muda a reunião para as dez” move o evento e mantém os intervalos: avisos às 9h30 e 10h.

- Compromissos avulsos, com até três avisos diferentes, na hora ou até sete dias antes. Sem antecedência solicitada, o padrão é um aviso na hora do evento. Todos os avisos precisam estar no futuro; a aplicação pergunta se algum já passou.
- Alterar avisos substitui a lista completa. Para acrescentar um aviso, o interpretador preserva os anteriores e inclui o novo. Reagendar preserva os intervalos quando não houver outro pedido explícito.
- Avisos antigos ficam cancelados com versão incrementada; jobs antigos não podem enviá-los. Evento, avisos, outboxes e resposta são gravados na mesma transação. Limites e pausa são conferidos antes de substituir avisos.
- Repetir os mesmos horários enquanto os avisos ainda aguardam envio preserva os registros existentes. Criação, alteração e cancelamento geram eventos de auditoria na mesma transação, com versão, origem, horário e intervalos anteriores/novos. Esse histórico é interno; ainda não há consulta dele pela conversa.
- Envio em andamento ou com resultado desconhecido bloqueia alterações do evento. Cancelar não desfaz mensagens já aceitas pelo provedor.
- MEU DIA apresenta o horário real dos eventos e os lembretes avulsos, sem contar cada aviso como outra tarefa. Avisos de compromisso informam também a hora do evento. Não oferecem os botões de adiar dos lembretes avulsos; alterações são feitas pela conversa.
- Lembretes avulsos e séries existentes continuam funcionando. Não são convertidos automaticamente em compromissos.

## Memória por cliente e projeto

“Orçamento do cliente João Silva é R$ 500” guarda um dado. “Atualiza o orçamento do João Silva para R$ 650” cria uma revisão. Consultas normais retornam o valor atual; pedidos de histórico mostram também os anteriores. Nome e tipo (cliente/projeto) são isolados por pessoa e número comercial. Nomes parciais potencialmente ambíguos pedem o nome completo.

- Um pedido cadastra um dado estruturado, com valor de até 180 caracteres. Mensagens com vários dados distintos são guardadas como anotação completa, sem prometer atualizar vários campos do cadastro.
- Anotações gerais continuam disponíveis. Se uma consulta não encontrar cadastro estruturado, procura o nome nas anotações anteriores. Notas antigas não são convertidas automaticamente em cadastro nem substituem um dado atual já cadastrado.
- O contexto mostra até oito cadastros recentes e cinco dados atuais por cadastro. A busca consulta os registros persistidos; o contexto não é a memória inteira. Histórico limitado a quinze registros e ao tamanho de uma mensagem.
- Não há edição/exclusão individual de notas pela conversa nem descarte automático neste incremento.

## Continuidade e publicação

Rascunhos preservam dia/hora, título, identificadores, avisos e vínculo com cliente/projeto. São recuperados das vinte últimas interações em sete dias; o histórico curto contém quatro trocas em trinta minutos. Há uma ação por mensagem. Não há consulta automática à internet, agenda externa ou arquivos.

A migração `20261020233000_appointments_and_business_memory` é aditiva: cria Appointment, BusinessSubject e KnowledgeFact e acrescenta campos opcionais a Reminder. O pre-deploy da API executa migrações. Workers aguardam os novos campos antes de interpretar mensagens ou consumir jobs, preservando tentativas durante a publicação.

As avaliações `scripts/evaluate-business.cjs --allow-provider` (11 turnos) e `scripts/evaluate-conversation.cjs --allow-provider` (7 turnos) usam IA real, dados fictícios, banco local terminado em `_test` e WhatsApp simulado. Testes cobrem horários, múltiplos avisos, rollback, reentrega, limites, pausa, isolamento, histórico, notas anteriores e inicialização antes da migração.

Railway apresentou “Deploys have been paused temporarily” na verificação deste pacote. Código enviado ao Git não significa versão ativa. Confirmar o commit em execução após a liberação e fazer um teste controlado antes de anunciar as funções no WhatsApp.

Áudio na nuvem permanece desabilitado; número Meta é de teste. Envios fora da janela de atendimento dependem de template aprovado. Não há Google Calendar, cobrança, equipes ou compromissos recorrentes neste pacote.
