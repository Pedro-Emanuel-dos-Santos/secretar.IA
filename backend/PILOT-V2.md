# Incremento local — 21/10/2026

## Entregue no código

- Anotações: buscar, corrigir e apagar, com isolamento por pessoa/conta, escolha diante de ambiguidade e proteção contra alteração de versão antiga.
- Perfil opcional: nome, atividade e fuso IANA por conta comercial. Novos pedidos, consultas e recorrências usam esse fuso. Avisos existentes mantêm seus instantes.
- Áudio: explicação do tratamento antes de consentir, autorização específica do provedor, revogação e bloqueio antes de baixar mídia quando não autorizado. A configuração do servidor e a lista de participantes continuam obrigatórias; nenhum provedor foi habilitado nesta etapa.
- Consumo: registro por mensagem/tentativa dos tokens informados pelo provedor, modelo e duração. Falha de medição não provoca nova chamada paga. Ausência de medição é desconhecida, não zero; não há cálculo financeiro nem medição de transcrição ou tarifas Meta.
- Limpeza de conteúdo: solicitação local, código de confirmação com validade de 15 minutos, isolamento por conta, revogação de processamento pendente e pausa dos avisos. Bloqueia exclusão diante de entrega em andamento/incerta. Mantém telefone e identificadores mínimos de entrega/deduplicação; não apaga cópias externas, backups nem mensagens já na Meta.
- Resumo diário: opt-in com horário local, consulta aos registros reais sem IA adicional, deduplicação por data/conta/pessoa e intervalo mínimo de 20 horas. Não cria mensagem de entrada nem estende a janela WhatsApp. Não recupera dias perdidos. Segue o fluxo normal de outbox e as regras de envio da Meta.

## Roteiro do teste final no WhatsApp

Somente após publicar API e ambos os workers na mesma versão e aplicar as migrações:

1. `Meu perfil`; depois `Meu nome é Pedro, sou autônomo e meu fuso é America/Sao_Paulo`.
2. `Anota que o fornecedor Alfa atende às terças`; busque, corrija e apague essa anotação de teste.
3. Crie tarefa com “daqui a um minuto”, compromisso às “nove e meia da manhã” e uma recorrência. Confira horário e diferença entre compromisso e aviso.
4. `Quero receber um resumo diário às 08:30`; confira `Meu perfil`; depois `Desative meu resumo diário`.
5. `AUDIO`; leia a explicação; `ACEITO AUDIO`; teste apenas se o servidor estiver configurado; `DESATIVAR AUDIO`.
6. `Meu consumo`: conferir tokens e tentativas desconhecidas, sem interpretar como fatura.
7. Em contato dedicado a dados fictícios: `APAGAR MEUS DADOS`; seguir a confirmação recebida. Verificar limpeza e pausa sem afetar outra conta comercial.

## Validação e publicação

`npm run check:pilot -- --integration` executa TypeScript, testes unitários e integração com provedores simulados. Aceita apenas banco local terminado em `_test`; `--migrate-test` aplica migrações apenas nesse banco.

As novas ações ainda precisam da avaliação conversacional com IA real e do teste final no WhatsApp. Os 21 turnos de IA avaliados anteriormente cobriam a versão anterior. Testes de interpretação simulada não demonstram por si só que o modelo escolherá sempre a ação certa.

Resultado local deste incremento: build e TypeScript passaram; 130 testes unitários e 137 de integração passaram, incluindo os 12 cenários do resumo diário. Nenhum envio real ou consumo pago de IA foi necessário nessa validação.

Novas migrações aditivas: `20261021120000_pilot_preferences_and_usage` e `20261021130000_daily_summaries`. Foram aplicadas somente no banco local de testes. Gerar Prisma client e fazer backup antes da migração de produção. Workers aguardam os campos novos antes de consumir trabalho.

Railway continua com publicação pendente. Número definitivo, aprovação de templates para envios fora da janela, configuração de áudio na nuvem, política de retenção abrangendo backups e modelo de cobrança continuam pendentes. Nenhuma mensagem real, publicação ou alteração de credenciais foi feita neste incremento.
