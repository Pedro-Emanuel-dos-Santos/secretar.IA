# Da conversa para um plano executável — 28/10/2026

Entrega validada localmente, em preparação de publicação. TypeScript,256 testes
unitários e295 integrações na suíte completa final aprovados. Dez cenários
integrados dedicados a planos/contexto. É uma mudança de
fluxo: a IA pode organizar um
pedido com várias ações em uma proposta revisável, em vez de obrigar a pessoa
a separar tudo em comandos. Não representa entendimento ou capacidade irrestritos.

Exemplo: “Anota o combinado, me lembra de ligar para João amanhã às10h e reserva
uma hora para revisar o relatório amanhã às14h”. A resposta lista as três ações,
horários e avisos, sem executar. Após revisar, “pode fazer” confirma o conjunto.
Se a pessoa ajustar uma parte, o contexto fornece as etapas completas para uma
nova proposta; a última proposta substitui a anterior para fins de confirmação.

## Implementação

assistant_plan contém2 a5 etapas sanitizadas. Criações suportadas nesta entrega:
save_note (até500 caracteres), create_reminder e create_appointment avulsos.
Etapas não podem editar/apagar dados, enviar mensagens a terceiros, fazer chamadas,
realizar gastos, criar séries ou salvar memória pessoal. Memória pessoal existente
continua com consentimento específico; conselho e conversa não são gravação automática.

Proposta fica em Event com escopo de contato/conta, origem, fuso e expiração de
15 minutos. Confirmação natural só é tratada pelo servidor após a última resposta
da proposta ter sido aceita pelo provedor. Texto citado, mensagem antiga, áudio,
outra conta, proposta expirada, substituída ou outra resposta intermediária não
autorizam execução. A IA não pode gerar autorização própria. A confirmação válida
dispensa interpretação por IA, inclusive após cota de pedidos atingida.

Execução usa uma transação com savepoint. Conflito, pausa ou limite desfazem o
conjunto e encerram a proposta como falha controlada, sem ações parciais. Falha
inesperada preserva as regras de retry do inbox. User lock e marcador de aplicação
impedem duas confirmações concorrentes ou replay de duplicar as ações. Agendamento
de avisos continua pela outbox existente, não por envio dentro da transação.

Cada etapa recebe IncomingMessage interno determinístico com status plan_step,
escopo e texto original. Isso permite múltiplos registros com origem única por
ação sem fingir que chegaram novas mensagens externas. São excluídos do histórico
curto e da cota de mensagens recebidas. Não criar fila/worker para esses registros.
Exportação e exclusão completas continuam incluindo os registros do contato.
O raciocínio recebe até12 acompanhamentos atuais com projeto, pessoa aguardada
e próxima ação, além dos dados e memórias já autorizados. Não inclui pendências
encerradas ou de outros contatos/contas. Explicação da sugestão pode acompanhar
a proposta, mas não é tratada como prova de execução.

## Validação necessária

Publicado em produção em28/10/2026, commit a072f63, três serviços Active.
TypeScript,257 unitários e296 integrações aprovados. Avaliação final com o
modelo real, parser e normalização:8/8 cenários fictícios, sem executar ações.
Vínculos a projetos de fundo são removidos sem pedido nominal ou proposta
anterior revisada; referência ambígua a projeto pede seu nome antes da proposta.
Ainda falta validar o ciclo completo de plano confirmado pelo WhatsApp.

Testes cobrem proposta sem escrita, aplicação conjunta, rollback na última etapa,
limites/pausa, confirmação natural, isolamento, expiração, replay, concorrência,
alteração do fuso, revisão do plano e cota atingida. Scripts de avaliação real
usam somente cenários fictícios e não executam os planos. Antes de declarar
experiência comprovada, verificar publicação e uma sequência real no WhatsApp.

Próximas expansões precisam de controles próprios: alterações de registros com
versão esperada, memória consentida e ações externas com autorização específica.
O fluxo atual ajuda a pensar, propor e organizar; não liga nem envia cobranças.
