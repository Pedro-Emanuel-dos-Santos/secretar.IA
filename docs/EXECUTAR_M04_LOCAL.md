# Ensaios M04 em ambiente isolado

Não usar o `.env` antigo. Não apontar para Railway. Imagens oficiais fixadas por
digest em `backend/compose.beta-test.yml`; portas loopback 5435/6381, volumes próprios.
FreeLLMAPI, toolkit, PostgreSQL 16 e Redis 7 locais existentes ficam separados.

No diretório `backend`, com Docker disponível:

```powershell
docker compose -f compose.beta-test.yml up -d --wait
$env:INBOX_TEST_DATABASE_URL='postgresql://secretaria_test:fictional_test_only@127.0.0.1:5435/secretaria_m04_test?schema=public'
$env:BETA_TEST_REDIS_URL='redis://127.0.0.1:6381/15'
$env:BETA_ARTIFACT_DIR='C:\Users\pedro\Documents\Codex\2026-10-15\cha\work\m04-novo'
$env:DATABASE_URL=$env:INBOX_TEST_DATABASE_URL
$env:DIRECT_DATABASE_URL=$env:INBOX_TEST_DATABASE_URL
node node_modules/prisma/build/index.js migrate deploy
node node_modules/typescript/bin/tsc
node scripts/check-pilot.cjs --integration
```

Essas credenciais são fictícias, limitadas aos contêineres de teste. O guard do
harness exige hostname 127.0.0.1, banco `_test` na porta 5435 e Redis na porta 6381;
usa Redis DB 15. Não mudar esse guard para permitir um destino remoto. A migração
acima é **local**; não confundir com a autorização necessária para migrar produção.

## Jornada com modelo real e checkpoints

1. `node scripts/beta-journeys.cjs prepare` cria fixtures pelo webhook assinado,
   consentimento e registros e exporta `plan-request.json`, com contexto recuperado
   do banco e hash do prompt/contexto.
2. `node scripts/beta-model-checkpoint.cjs plan` é **dry-run**, zero chamadas.
   Para nova inferência real, é preciso autorização de gasto vigente, chave atual
   fornecida no ambiente de execução e `OPENAI_MODEL` avaliado. Não colar chave em
   chat, comando, Git ou logs; o script não carrega `.env`.
3. Só depois dessa autorização: adicionar `--allow-provider` e
   `--spent-usd=TOTAL_ACUMULADO_EXATO` à chamada do checkpoint. O teto do helper é
   US$ 0,10 e o total anterior é obrigatório. A execução desta missão encerrou em
   US$ 0,0744716 acumulados, não zero. Não repetir chamadas para consultar o relatório.
   Resposta existente bloqueia nova chamada; lock exclusivo impede duplicação
   concorrente e permanece em resultado incerto para inspeção, sem retry automático.
4. `node scripts/beta-journeys.cjs plan` revalida contexto/hash e aplica a resposta
   real pelo router/parser/guardas/inbox, verifica proposta sem escrita antecipada,
   confirmação e deduplicação; recupera memória e prepara `correction-request.json`.
5. Avaliar `correction` pelo mesmo helper, carregando **também** o gasto do plano.
   Se o saldo não cobre a reserva, parar. Não reduzir silenciosamente o total gasto.
6. `node scripts/beta-journeys.cjs correction` verifica mesmo ID, dia, fuso,
   versão, duração e avisos persistidos e publica a outbox em Redis real.
7. `node scripts/beta-failure-journeys.cjs` testa isolamento, recusa, exclusão,
   revogação, retomada, ACK perdido, versão antiga, retry conhecido, incerteza,
   templates e recibos simulados. Não faz novas chamadas OpenAI.

Nesta missão a chave atual foi usada internamente numa sessão autenticada para
os dois checkpoints, sem exportação. O helper local acima oferece o transporte
direto para uma futura execução autorizada com credencial atual disponível nele.
O JSON publicado contém os resultados; o binário de backup fica só no workspace.

O `fetch` global do harness é bloqueado. O sender recebe um fetcher fake, e o
webhook recebe HTTP loopback real. Nenhum envio WhatsApp externo é necessário.
Relógio fixo de junho de 2099 e promoção de jobs são mecanismos de teste explícitos.
Uma proposta/confirmacão antiga que mudou o contexto não pode consumir uma resposta
de outro checkpoint: o hash e o estado precisam conferir.

## Restauração e compatibilidade

Somente após encerrar workers e outros testes que escrevem nesse banco:

```powershell
$env:BETA_DOCKER_EXE='C:\Users\pedro\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'
node scripts/beta-recovery-drill.cjs
```

O script verifica rótulos do projeto Docker de teste, cria bancos novos `_test`,
faz dump/restauração com `--single-transaction`, compara todas as tabelas e rejeita
arquivo truncado. Aplica migração a uma baseline local com dados anteriores e
compara contratos do source `a072f63` com os atuais. Não faz down migration.

Também testa pausa global, SAVE/CRC, **mata somente o Redis M04 de teste** e o
inicia de novo, restaurando ainda o RDB em outro contêiner sem rede. Não executar
enquanto outro teste estiver usando esses serviços. O script não remove bancos,
volumes ou arquivos de produção. Se falhar, preservar artefatos e investigar;
não aplicar resets indiscriminados para obter uma contagem verde.

Para encerrar apenas os serviços novos e preservar volumes:
`docker compose -f compose.beta-test.yml stop`. O contêiner Redis de restauração,
cujo nome exato está no resultado JSON, também pode ser parado. Não usar `down -v`
para esconder evidência nem encerrar contêineres externos a este projeto.

## Interpretação da evidência

`plan-persisted`, `correction-persisted`, assertions e `failure-journeys` têm estados
das etapas. `recovery-drill` tem manifestos/hashes e a comparação de contratos.
Rodadas de montagem do harness que falharam não são prova de sucesso; a validação
final exige as asserções concluídas e as suítes aprovadas. O relatório diferencia
provedores simulados, respostas reais transportadas por checkpoint e operações
remotas não executadas. Não afirmar que qualquer um desses ensaios, sozinho,
libera o beta ou comprova entrega real da Meta.
