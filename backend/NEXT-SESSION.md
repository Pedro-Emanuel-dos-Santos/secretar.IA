# Retomada da Secretár.IA — 21/10/2026

## Estado confirmado mais recente

- Incremento local adicional: perfil/fuso por conta, edição/exclusão de notas, consentimento informado de áudio, medição de tokens, limpeza confirmada de conteúdo e resumo diário opcional. Ver `PILOT-V2.md` para limites e roteiro de testes. As novas ações ainda não passaram pela IA real nem WhatsApp.
- Railway foi acessada novamente: serviços online, porém novos deploys temporariamente pausados por “Limited Access”. PostgreSQL não possui acesso público e o painel mostrou ausência de backups nativos. Não foi aberto acesso público ao banco.

- A avaliação de 21 turnos com IA real passou na retomada de hoje. Usou dados fictícios, banco local isolado e WhatsApp simulado; nenhum envio real.
- Foram corrigidos campos nulos omitidos pelo modelo, consulta factual respondida diretamente sem buscar o cadastro e busca textual de compromissos com artigos/acentos. Identificador inválido continua sendo recusado, sem substituição silenciosa por outro registro.
- A API pública respondeu HTTP 200 e {"status":"ready"}. Isso confirma prontidão da versão já publicada, não a publicação dos incrementos locais.
- O painel da Railway mostrou: “Dashboard and API unavailable, builds paused. We’ve found the cause and are working on a fix.” Nenhum deploy ou push foi feito durante o incidente.
- Branch: codex/railway-ready-20261020. Antes das correções da retomada, HEAD=a80f75d e havia cinco commits locais acima do remoto. Consultar git log/status atuais.
- Migrações novas foram aplicadas apenas ao banco local secretaria_inbox_test. Banco pessoal e produção não foram migrados nesta retomada.

## Próximos passos

1. Conferir acesso e recuperação do painel/API da Railway. Se persistir o incidente, não presumir liberação de builds.
2. Conferir backup do PostgreSQL e revisar commits locais. Depois de autorizada a publicação, enviar a branch e acompanhar pre-deploy da API com as migrações aditivas.
3. Confirmar o commit ativo na API, inbox e worker de lembretes. Workers aguardam os novos campos antes de consumir trabalho.
4. Conferir /health/ready e executar teste controlado no WhatsApp autorizado: compromisso futuro, avisos, alteração, cancelamento e tarefa aguardando/concluída.
5. Somente após o teste real anunciar as funções como disponíveis.

## Verificação local

No backend: npm run check:pilot -- --integration. O comando aceita apenas banco local terminado em _test e remove credenciais dos provedores no ambiente dos testes. A opção --migrate-test exige --integration e aplica migrações somente nesse banco.

Para IA real: build atualizado e scripts/evaluate-business.cjs --allow-provider, com INBOX_TEST_DATABASE_URL local e AI_MODE=openai. Usa tokens do provedor; mensagens WhatsApp são simuladas.

## Referências e limitações

FOLLOWUPS.md explica o incremento; SESSION-20261021.md registra a etapa noturna anterior à validação real. Essa avaliação pendente no documento anterior agora foi concluída na retomada.

Número definitivo, template fora da janela, áudio na nuvem, retenção completa de dados e medição financeira por usuário continuam pendentes. Há medição de tokens e limpeza parcial de conteúdo no código local, descritas em PILOT-V2.md. Não enviar segredos ao chat. Antes de usar o build novo com o banco pessoal, fazer backup e aplicar as migrações; ele ainda não recebeu as migrações novas nesta sessão.
