# Secretar.IA — desenvolvimento local

Backend TypeScript de secretária pessoal pelo WhatsApp oficial da Meta.

## Fluxo atual

POST /webhook → assinatura sobre os bytes originais → validação do lote → PostgreSQL IncomingMessage → HTTP 200.

O worker de entrada prepara e valida a interpretação, salva o resultado e executa a ação em uma transação de banco. Criar um lembrete grava, na mesma transação, o lembrete, a pendência de agendamento (ScheduleOutbox), a resposta (ReplyOutbox) e o avanço da entrada. Nenhuma chamada de IA, Redis ou WhatsApp ocorre dentro dessa transação. Publicação e envio acontecem depois. A origem possui vínculo único para impedir recriação da mesma ação.

A identidade é composta por phoneNumberId e providerMessageId. A restrição única do banco protege contra reentregas e recepções concorrentes. O texto completo do webhook não é armazenado: somente a mensagem de texto e identificadores necessários.

## Configurar e iniciar

Na pasta backend, com Node, PostgreSQL e Redis disponíveis:

1. Confira seu .env privado usando .env.example como referência. Não substitua suas credenciais existentes.
2. Preencha WHATSAPP_APP_SECRET (segredo do aplicativo Meta), WHATSAPP_VERIFY_TOKEN (mesmo valor na configuração do webhook) e ADMIN_API_TOKEN (segredo da API interna). O access token não substitui o app secret.
3. Abra Docker Desktop e execute `docker compose up -d postgres redis`, se usar os serviços do Compose. Evolution API não participa deste código.
4. Execute `npm ci` somente se precisar reinstalar dependências.
5. Execute `npm run db:generate` e `npm run db:migrate` no banco local destinado ao projeto. As etapas novas adicionam IncomingMessage, ScheduleOutbox, ReplyOutbox e controles de preparação/envio. Sem as migrações, o fluxo não funciona.
6. Execute `npm start`.
7. Em outro terminal, execute `npm run worker:inbox`.
8. Em um terceiro terminal, execute `npm run worker`.

A API responde em http://localhost:3000/. PostgreSQL do Compose usa localhost:5433; Redis, localhost:6379. São três processos: API, entrada e lembretes. A API sozinha persiste mensagens; a interpretação e a recuperação de agendamentos aguardam o worker de entrada.

O modo hybrid pode chamar OpenAI e Ollama. Confira OLLAMA_MODEL e o serviço Ollama. Não houve troca automática do modelo nem validação de credenciais.

Sem WHATSAPP_APP_SECRET/WHATSAPP_PHONE_NUMBER_ID, POST /webhook retorna 503. Sem assinatura válida, retorna 401. GET /webhook exige WHATSAPP_VERIFY_TOKEN e devolve o desafio como texto. Falha ao persistir retorna 503 para permitir reentrega; eventos suportados são confirmados somente após o banco concluir. Status de entrega, mídia e eventos de outros números não executam ações nesta versão.

A API interna /reminders e a consulta GET /operations exigem Authorization: Bearer seguido de ADMIN_API_TOKEN. Sem token configurado retornam 503; token ausente/incorreto retorna 401. Esse token é para ferramentas internas, não para o usuário no WhatsApp.

## Testar sem WhatsApp real

- `npm test`: testes unitários e HTTP local; persistência/fila/IA/envio simulados, sem serviços externos.
- `npm run typecheck`: checagem de tipos.
- `npm run build`: compilação.
- `npm run test:integration`: PostgreSQL real e HTTP local, com IA/fila/envio simulados.

Para integração, use um banco separado e descartável, em loopback, cujo nome termine em _test. Gere o cliente e aplique as migrações nesse banco, depois configure INBOX_TEST_DATABASE_URL:

```powershell
$env:INBOX_TEST_DATABASE_URL = 'postgresql://USUARIO:SENHA@127.0.0.1:PORTA/secretaria_inbox_test?schema=public'
npm run test:integration
```

O runner recusa URL ausente, host externo e nome sem _test. Cria somente dados de teste com identidade única e remove seus próprios registros ao terminar. Nunca aponte ao banco pessoal ou de clientes. Logs genéricos de erro durante testes de falha são esperados.

Os antigos src/test-*.ts são scripts manuais que podem criar jobs/enviar mensagens; não fazem parte da suíte segura e um deles contém data fixa passada.

Para experiência real ainda faltam segredos privados, migração do banco local escolhido, HTTPS público configurado na Meta e destinatário de teste autorizado. Não houve envio real nesta rodada.

## Estados da caixa de entrada

| Estado | Significado | Conduta atual |
|---|---|---|
| received | Mensagem persistida, ainda não assumida | Worker pode processar, inclusive após reiniciar |
| interpreting | Preparação da interpretação em andamento | Posse de dois minutos; pode repetir preparação sem executar ação |
| interpreted | Interpretação validada e persistida | Retomar ação usando esse resultado, sem consultar IA |
| executing | Execução em banco em andamento | Transação com verificação de posse; recuperação após expirar |
| reply_pending | Ação/resultado e resposta persistidos | Enviar a resposta pendente sem repetir ação |
| reply_sending | Envio da resposta iniciado | Não repetir automaticamente |
| completed | Provedor confirmou a identidade da resposta | Não comprova entrega ao destinatário |
| reply_unknown | Resultado do envio da resposta incerto | Investigar, sem repetir automaticamente |
| failed | Preparação ou execução esgotou tentativas | Consultar código genérico de falha e operação |
| processing / processing_unknown | Estados da versão anterior | Investigar; não retomar automaticamente |

A preparação e a execução têm contadores separados, com cinco tentativas por fase e espera progressiva. Um token protege a posse: um processo antigo não consegue sobrescrever resultado de quem recuperou a entrada. A execução mantém o registro bloqueado durante a transação, de modo que ação e resposta não sejam confirmadas parcialmente.

A preparação tem prazo de 45 segundos. Isso limita a espera do fluxo; a requisição subjacente ao provedor pode continuar até o limite do respectivo cliente. Um resultado tardio não executa ação nem substitui o resultado salvo por outro processo.

Para acompanhar sem exibir conteúdo privado:

```sql
SELECT status, COUNT(*) FROM "IncomingMessage" GROUP BY status;
SELECT COUNT(*) FROM "IncomingMessage"
WHERE status = 'processing' AND "startedAt" < NOW() - INTERVAL '15 minutes';
```

Quinze minutos nessa consulta é um critério de investigação dos estados antigos, não autorização de reexecução. GET /operations e `npm run ops` mostram contagens por estado e atenção operacional, sem textos, telefones ou IDs de mensagens. Envios em andamento há menos de dois minutos não são sinalizados como travados. Ainda não há painel visual nem alertas automáticos.

Com a API local iniciada, execute `npm run ops`. O comando lê ADMIN_API_TOKEN do .env sem imprimi-lo. Campos de atenção incluem preparação com posse expirada, respostas/lembretes com envio incerto ou parado, falhas finais e estados legados.

Não apague identidades de mensagens indiscriminadamente: elas sustentam a deduplicação.

## Garantias e limites

- A validação de telefone/título/data ocorre antes de gravar. Datas são futuras, com calendário válido e fuso explícito.
- A saída da IA é validada; saudações em texto livre não quebram a interpretação JSON.
- A aplicação confirma criação somente após salvar e obter confirmação da fila. Não usa a fala da IA para afirmar execução.
- Se a fila não confirmar, o registro permanece em scheduling_pending e a outbox mantém a tentativa para recuperação. A aplicação responde que registrou o lembrete, mas que o agendamento ainda não foi confirmado. A API interna devolve HTTP 202 nesse caso.
- O horário original de entrada é passado ao contexto, evitando que espera no worker desloque “amanhã”. Ainda não há tratamento completo do timestamp original do provedor.
- Worker de lembretes registra provider_accepted após sucesso HTTP. Não comprova entrega; status antigos sent não foram migrados.
- Lembrete e outbox são gravados na mesma transação. Uma queda após o commit deixa uma pendência recuperável, em vez de depender de recriar a ação.
- Publicação na fila tem cinco tentativas persistidas por padrão, com espera de 30 s, 1 min, 2 min e 4 min entre falhas. Uma publicação assumida por processo interrompido pode ser recuperada após dois minutos, sem zerar tentativas. O prazo de confirmação de cada add é cinco segundos.
- O job tem o ID estável do lembrete e é mantido após conclusão/falha. Antes de enviar, o worker assume o lembrete no banco como sending. Jobs repetidos não iniciam outro envio se o estado já avançou.
- Não há garantia de entrega única no WhatsApp. Queda após iniciar envio deixa sending ou delivery_unknown e não é repetida automaticamente. Até uma falha de rede aparentemente precoce pode ter resultado externo incerto.
- Ao esgotar publicação, a outbox fica failed e o lembrete pode ficar scheduling_failed. Isso indica falha de confirmação: um job ainda pode existir no Redis. Caso ele execute, a proteção de envio permite uma única tentativa e o estado pode avançar.
- Respostas pendentes são recuperadas pela ReplyOutbox sem repetir interpretação/ação. Antes de iniciar envio, a resposta de criação é atualizada com o estado real do lembrete e o texto exato é salvo. Depois de iniciar o envio, queda ou erro produz situação incerta; não há reenvio automático.
- A migração não retoma automaticamente estados antigos processing/processing_unknown nem reenvia respostas históricas.
- Esgotar tentativas de preparação/execução aparece em failed na operação; ainda não há alerta automático ou mensagem de falha automática para a pessoa.
- A IA recebe contexto recente limitado: até quatro trocas dos últimos 30 minutos e doze lembretes ativos, sempre por pessoa e número comercial. Resposta pendente não é apresentada como fala já enviada. Isso ainda não substitui um estado formal de esclarecimento nem garante compreensão correta sem avaliação real do modelo.
- Consultar, cancelar e concluir estão implementados no fluxo transacional de conversa. Alterar título/horário, recorrência, áudio e gastos continuam pendentes.
- O worker processa um lote por vez. Mais workers podem executar mensagens diferentes da mesma pessoa em paralelo; antes de contexto persistente, implementar serialização por usuário.
- O número comercial é configurado por ambiente. Isso não é um SaaS com várias contas comerciais isoladas.
- Retenção, exclusão/exportação e limites de consumo ainda precisam de implementação.

## Operar a recuperação

O mesmo worker:inbox prepara entradas, tenta publicar os agendamentos e envia respostas pendentes, nessa ordem. Não é necessário outro processo. Ele respeita nextAttemptAt, posse e limites persistidos. A recuperação de ação com interpretação já salva e a recuperação de resposta não consultam a IA novamente.

Sem WHATSAPP_ACCESS_TOKEN, a preparação continua, mas as respostas ficam pendentes para um reinício com configuração válida. O próprio envio de lembretes também depende das credenciais Meta corretas.

Lembretes atrasados mais de um minuto recebem o prefixo “Lembrete atrasado”. Ainda é preciso definir uma política de expiração para períodos prolongados sem serviço.

```sql
SELECT status, COUNT(*) FROM "ScheduleOutbox" GROUP BY status;
SELECT status, COUNT(*) FROM "Reminder" GROUP BY status;
SELECT COUNT(*) FROM "Reminder"
WHERE status IN ('sending', 'delivery_unknown', 'scheduling_failed');
```

Não redefina estados de envio para pending nem zere tentativas manualmente sem investigar. Isso pode repetir efeitos. O vínculo entre Reminder e IncomingMessage usa exclusão restrita: ao implementar exclusão de dados, remova ou trate os lembretes antes da origem.

Registros antigos não receberam outbox automaticamente. Lembretes legados em pending/scheduling_unknown precisam de reconciliação; a migração não dispara lembretes históricos. Jobs manuais sem reminderId persistido agora são recusados.

## Consultar, cancelar e concluir

No WhatsApp de teste autorizado, os pedidos esperados incluem “quais lembretes tenho?”, “o que tenho para hoje?”, “cancela o lembrete da internet” e “já resolvi o lembrete da internet”. A interpretação real ainda precisa de validação com o modelo e a Meta; os testes automatizados simulam a interpretação.

Consultas mostram até dez registros ativos; intervalos usam início inclusivo/fim exclusivo com fuso explícito. IDs internos não aparecem na mensagem. Título ambíguo pede escolha e não altera um candidato arbitrariamente.

O campo state representa active/cancelled/completed. O campo status continua representando agendamento/envio. Concluir uma responsabilidade não apaga o resultado de um envio já iniciado.

Cancelar ou concluir impede novos disparos pelo worker atualizado, inclusive de jobs já publicados. Um publicador antigo pode terminar seu add, mas o worker confere state no banco antes de enviar. Se o aviso já entrou em envio, a aplicação não confirma cancelamento. Concluir durante envio preserva a conclusão e o resultado posterior do provedor, informando que o envio já havia começado.

As operações e suas respostas são gravadas na mesma transação. Os filtros de pessoa/número comercial são aplicados no banco, inclusive quando a IA fornece um ID.

Reinicie API e ambos os workers com o código atualizado após aplicar as migrações. Um worker antigo não conhece state e não oferece a nova proteção de cancelamento.

O contexto de 30 minutos limita o que é consultado/enviado à IA; não apaga automaticamente os registros persistidos. Preferências duradouras e retenção/exclusão ainda são etapas futuras. Alterar horários exigirá versionar o agendamento para que jobs antigos não disparem.

## Decisões e próximos passos

A prioridade de produto é a pessoa poder confiar que o pedido foi registrado e que falhas aparecem. A caixa de entrada usa o PostgreSQL existente e não adiciona framework nem fornecedor.

Próxima entrega: alterar título/horário com versionamento de jobs, serializar mensagens da mesma pessoa e manter esclarecimentos explícitos com expiração. Depois validar a experiência com IA, Redis e WhatsApp reais. Envios de resultado incerto continuam exigindo tratamento próprio.

Na sequência: contexto de esclarecimento com expiração e referências ambíguas; preferências corrigíveis/excluíveis; agenda diária e semanal; áudio; proatividade autorizada. Somente depois de medir uso, retenção, custo por pessoa e suporte, estruturar piloto pago e avaliar integrações.

A assinatura segue o mecanismo documentado pela Meta: [referência oficial de webhooks](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/). O SDK citado está arquivado; o projeto usa Express e crypto nativo, sem instalar esse SDK.
