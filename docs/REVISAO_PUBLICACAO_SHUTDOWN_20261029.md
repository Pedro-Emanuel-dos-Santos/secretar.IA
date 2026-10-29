# Revisão e publicação controlada de shutdown — 29/10/2026

**GO apenas para revisão no GitHub. Produção continua NO-GO; nenhuma publicação,
pausa de fila, alteração remota, TLS, migração ou backup foi executado.**

O commit `507eb02` foi revisado. Sua branch completa inclui a migração
`20261028180000_reliable_delivery_ai_usage` e alterações anteriores de inteligência,
envio e backup. Publicar a ponta inteira não isolaria shutdown.

Preparei `codex/dev-shutdown-only-20261029`, derivada do SHA ativo
`a072f63353961ea6da0c5756417967a91248a317`, com somente:

- lifecycle, rastreamento HTTP, handlers e loops de shutdown de `507eb02`;
- checagens de schema dos workers compatíveis com a baseline, sem campos novos;
- extração do processador de jobs com o mesmo fluxo anterior de versão/claim/envio;
- `backend/railway.json` candidato com `preDeployCommand: []` para esta manutenção;
- testes fictícios e esta documentação. Nenhum módulo TLS/backup foi acrescentado.

Schema, diretório de migrações, pacotes/lockfile, sender WhatsApp e funções de
claim/envio/outbox são idênticos à baseline. Nenhum status/action novo é criado.
Isso permite preparar uma publicação independente de TLS, backup e migrações;
não resolve o template Meta nem publica as demais melhorias do beta.

## Proteção do push

API/inbox/lembretes seguem `codex/railway-ready-20261020`. O serviço de backup
tem origem na antiga branch dev, mesmo com pin `9a4e2c8` e watch paths. Não usei
pin/watch paths como garantia de ausência de deploy: a antiga branch não será
atualizada. A nova branch de revisão não aparece em nenhum dos nove serviços dos
três projetos/ambientes acessíveis. Não há PR aberto nem workflow `.github` nas
branches consultadas ou no candidato. O push será de um único ref, sem PR, merge,
tag ou mudança de configuração Railway. Revalidar imediatamente antes e depois.
[Evidência de conexões](evidence/shutdown-review-connections-20261029.json).

## Deadlines recomendados — configurar somente com autorização

| Serviço | `SHUTDOWN_TIMEOUT_MS` | `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` |
|---|---:|---:|
| API | 30000 | 45 |
| Inbox | 120000 | 150 |
| Lembretes | 60000 | 75 |

O default interno de lembretes continua 30 s; a recomendação usa override de 60 s
para dar margem à chamada HTTP de até 15 s, operações persistentes e reconciliação.
Na branch completa, fallback HTTP + consulta de template podem consumir 38 s só
em rede, portanto 30 s tampouco seria suficiente ali. Margens não garantem que um
banco indisponível termine: o deadline ainda pode preservar um envio incerto.

A configuração remota consultada não declara draining nem essas variáveis.
A Railway documenta padrão de 0 s; a versão nova recusa iniciar com prazo ausente
ou menor que deadline + 5 s. `Worker.close()` não tem timeout próprio em TypeScript.
Confirmar valores efetivos e comando direto `node dist/...` recebendo SIGTERM;
não presumir propagação por npm/Railpack ou prazo durante OOM/falha de host.
Config-as-code pode sobrepor o painel: conferir a configuração resolvida de cada
deployment, em especial **nenhum pre-deploy de migração**. O arquivo local não
altera a configuração atual da Railway.

Fontes: [Railway teardown](https://docs.railway.com/deployments/deployment-teardown),
[Railway autodeploy](https://docs.railway.com/deployments/github-autodeploys),
[BullMQ shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown).

## Sequência mínima futura — um serviço por vez

Cada etapa requer autorização explícita de produção; não executar este roteiro.
Backups reais recuperáveis, janela operacional e diagnóstico atualizado continuam
gates pendentes. Contagens anteriores não substituem a leitura na janela.

1. **Preparar a janela:** aprovar SHA exato, parâmetros, start commands e rollback.
   Garantir que atualizar a fonte de um serviço não publique os três ao mesmo tempo;
   usar release manual/pin por serviço com autodeploy controlado. Aplicar os prazos
   primeiro ao deployment que será encerrado e comprovar sua vigência antes do
   corte; se configurar variável exigir redeploy, esse redeploy também precisa de
   autorização e contenção — não presumir que o processo antigo ganhou tempo.
   Recolher totais de fila, inbox/outboxes, leases e envios incertos. Sem leitura
   confiável ou sem recuperação aprovada, parar.
2. **Lembretes primeiro:** sob autorização, pausar globalmente BullMQ, preservar
   jobs e aguardar active=0. Se houver ativo, não usar remoção/restart como forma de
   drenar o código antigo. Publicar só o worker candidato. Conferir SHA, instância
   antiga encerrada, schema gate, Redis/Postgres saudáveis e nenhum envio incerto
   novo. Retomar somente com autorização, após revisar avisos vencidos e versões.
3. **Inbox:** conter entrada HTTP/admin e todas as réplicas produtoras sob uma
   janela autorizada, mantendo o Redis e os jobs futuros intactos. Aguardar leases
   de interpretação/execução e envios em curso; uma mensagem recebida durante o
   corte deve falhar para reentrega, nunca receber 200 sem persistência. Publicar
   apenas inbox. Confirmar SHA, ausência do consumidor antigo e progresso dos
   pendentes elegíveis, preservando origem, versão e estados incertos.
4. **API:** publicar por último com start direto `node dist/server.js`, prazos e
   configuração resolvida sem migrate deploy. Exigir três readiness 200 consecutivos
   em até 60 s após a inicialização. Readiness comprova dependências, não WhatsApp.
   Restabelecer entrada controladamente e acompanhar deduplicação, inbox e outboxes.
5. **Gate entre serviços:** observar pelo menos 5 min e três leituras agregadas
   de progresso. Não exigir backlog total zero: jobs futuros não são atraso.
   Um teste funcional real de WhatsApp/recibo só ocorrerá se a autorização da janela
   o incluir. Não declarar validação de entrega apenas por silêncio ou HTTP 200.
   Não avançar se não houver trabalho observável suficiente para o critério.

Se a contenção operacional não puder ser realizada sem encerrar à força um
processo ativo, parar e apresentar a intervenção necessária. Este pacote não
acrescenta mecanismo remoto de pausa de inbox nem deve simular um inexistente.

## Parada e rollback

Interromper avanço diante de: readiness sem estabilizar em 60 s; crash loop;
erro persistente de DB/Redis por 60 s; pendência elegível sem progresso por 180 s;
novo `sending` preso/`delivery_unknown` ligado ao corte; `shutdown_forced`/SIGKILL
inesperado; qualquer duplicação ou divergência de versão/conta. Registrar baseline
e delta para não atribuir um incidente antigo ao deploy. Primeiro conter e
diagnosticar; esses sinais não autorizam reenviar nem rollback automático.

Para voltar um serviço: conter entrada/claims, aguardar operações, reconfirmar
contratos e reativar **o artefato exato `a072f63`**, com credenciais atuais e prazo
adequado. Não mover uma branch acompanhada pelos três serviços. Não restaurar
banco/Redis, executar down migration, retry de todos os jobs, limpar leases,
reescrever versões ou converter estados para pending.

O código de envio da baseline, preservado neste candidato, só reivindica estados
permitidos: não reivindica `sending`, `delivery_unknown` ou `provider_accepted`.
O mesmo vale para replies não pendentes. O teste de rollback exercita esses estados
persistidos nos dois caminhos sem chamar o remetente. Envios incertos permanecem
dependentes de recibo/evidência do provedor; ausência de recibo não prova não envio.
Essa compatibilidade não autoriza voltar à baseline depois de publicar a versão
completa, estados novos ou alterações de dados de outra missão.

## Evidências e autorizações restantes

Build passou; **267 unitários + 296 integrações + 17 testes de interrupção/rollback = 580 aprovados, zero falhas e skips**. Não encontramos regressões nos percursos exercitados. Não é prova de ausência de regressões em produção.

Build e resultados específicos do candidato estão em
`docs/evidence/shutdown-review-validation-20261029.json`; os 657 testes anteriores
não são apresentados como prova desta derivação. Os testes atuais usam apenas
PostgreSQL/Redis fictícios, interpretação e remetente simulados.

Para avançar, Pedro precisará autorizar: **(A)** fechar backup/recuperação real
pendentes; **(B)** configuração dos prazos, fonte manual, contenção e deploy dos
três serviços na ordem acima, incluindo rollback delimitado; **(C)** teste real de
WhatsApp e retomadas. TLS e reinício Redis continuam fora dessa janela e dependem
de autorização separada. Não há promessa de ausência de regressões em produção.
