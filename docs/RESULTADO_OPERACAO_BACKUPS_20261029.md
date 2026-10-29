# Entrega operacional de backup — 29/10/2026

**GO para revisão da implantação; NÃO ativado em produção.** Base `6487eca`,
branch `codex/dev-beta-reliability-20261028`. Alterações exclusivamente no pacote
de backup, testes, exemplos e documentação. API, inbox, lembretes e esquema da
aplicação preservados. Nenhuma consulta/exportação dos bancos reais.

## Resultado por requisito

| Requisito | Entrega / limite |
|---|---|
| rclone R2 | Ajuste `NO_HEAD=true` incorporado ao Store; HEAD de origem mantido. GET completo + SHA-256 de bundle e COMMITTED obrigatórios. Confirmado no R2 sem override externo. |
| Executor6h único | Preparado single-shot Linux, uma réplica/scheduler, flock e advisory lock PG. Plano local, sem serviço/cron criado. |
| Concorrência/interrupção | Travas, timeout, perda de sessão, SIGTERM e SIGKILL testados. Novo UUID ao recuperar; scratch somente de runs abandonados, links recusados; sem falso sucesso. |
| Registro | JSON atômico por run e eventos stdout sanitizados. Distingue falha de monitor após storage íntegro. Persistência real exige volume ainda não criado. |
| E-mail externo | Adaptador e plano Healthchecks gratuito preparados; falha/ausência/duração e recebimento real precisam ser validados depois de configurar o serviço. Nenhum e-mail real enviado. |
| Identidade age | Procedimento portátil, cifrado por senha do responsável, duas cópias fora do Windows/Railway. Recuperação com cópia fictícia Linux comprovada; chave real/cofre/mídia ainda não criados. |
| Renovação R2 | Aviso14dias, bloqueio conservador em 28/11; plano de troca em 24/11. Nenhuma rotação ou ampliação de permissão nesta etapa. |
| Custos/publicação | Plano revisável e exemplos ~US$0,80/mês para bundles50MB ou ~US$2,30 para250MB. Nada provisionado. |

## Provas executadas

1. Build da imagem isolada com ferramentas reais PG18, Redis8.2, age e rclone.
2. **31/31 testes locais** em 13,230s, exit0. Primeiro conjunto tinha30 casos;
   acrescentada e verificada a repetição segura de limpeza pendente após falha.
3. **1/1 E2E com R2** em 18,615s, exit0. Fontes exclusivamente Docker interno:
   `pg-test/secretaria_backup_test`, `redis-test`; sem portas host ou `.env`.
   Só o runner teve egress para o R2; os bancos de teste permaneceram internos.
4. Captura real desses fixtures → manifesto de snapshot PG → RDB por replicação →
   age → Store R2 corrigido → GET/SHA → COMMITTED/GET/SHA → journal `succeeded` →
   download → decrypt com cópia independente → novo PG `_test` e Redis Unix socket.
5. Três tabelas fictícias, uma linha cada: contagens/hashes idênticos. Redis:
   oito chaves persistentes em duas DBs com hashes idênticos. Chaves com TTL são
   explicitamente excluídas da igualdade, pois expiram com o relógio. Restore
   manteve `outboundAllowed:false`.

Run E2E: `70340761-1bed-480d-a4d4-dac5e4413be9`.
Bundle criptografado: **20.680 bytes**, SHA-256
`ac32c6f43c19ce7673f5cd948663e58f1c1d07aad56eddde456f98e8d2a2d725`.
Novos objetos somente `v1/{runId}/bundle.tar.age` e `COMMITTED.json`, identificados
como fixture; continuam sob retenção/lock existentes. Nada apagado ou desprotegido.
O marcador permanece `restoreVerified:false`: a prova de restore é esta evidência
separada, sem sobrescrever um objeto protegido.

Evidências versionadas:
- [31 testes locais](evidence/backup-operational-local-20261029.log).
- [E2E estruturado](evidence/r2-operational-e2e-20261029.json).
- [Log E2E](evidence/r2-operational-e2e.log).

Teste de e-mail/monitor é contrato com double local. Não comprova entrega SMTP,
execução do motor externo Healthchecks ou alerta real fora da Railway. A cópia age
independente do teste está no mesmo host físico Docker: comprova portabilidade do
formato sem DPAPI, não uma guarda física externa já realizada. Não se repetiram
testes da aplicação/IA: seu código não mudou, nenhuma OpenAI ou Meta foi chamada.

## Arquivos principais

- `backend/backup/backup.py`: compatibilidade, checkpoints e controle de subprocessos.
- `backend/backup/executor.py`: travas, journal, interrupções, recuperação e validade.
- `backend/backup/test_executor.py`: casos de operação e falhas, sem cloud.
- `backend/backup/test_r2_e2e.py`: captura/restauração completa com fixtures e R2.
- `backend/backup/compose.fixture.yml` e `compose.r2-test.yml`: isolamento/egress.
- `backend/backup/executor.plan.json`, `monitor.plan.json`, Dockerfile e env example.
- [Runbook/custos/identidade/renovação](OPERACAO_BACKUPS_20261029.md).

## Reprodução

Local, sem credenciais R2:

```powershell
docker compose -f backend/backup/compose.fixture.yml build tests
docker compose -f backend/backup/compose.fixture.yml up --abort-on-container-exit --exit-code-from tests tests
docker compose -f backend/backup/compose.fixture.yml down --volumes
```

Para E2E R2, fornecer SOMENTE os quatro secrets/configs BACKUP_R2 por meio privado
ao processo e `BACKUP_TEST_EVIDENCE_DIR` fora do repo. Não colocar valores em linha
de comando, `.env` versionado ou `docker compose config` (este expande segredos).
Aplicar os dois arquivos compose no mesmo projeto de teste, iniciar de bancos
novos e encerrar ambos com `down --volumes` ao terminar. O wrapper desta execução
recuperou a credencial já cifrada do usuário em memória e apagou as variáveis do
processo ao sair; nenhum segredo foi commitado. Não rotacionou a credencial.

## Riscos/gates restantes antes de ativar

- Aprovar recursos, custo e injeção de credenciais, e confirmar endereço de e-mail.
- Criar/checkar monitor externo e receber avisos reais de teste.
- Gerar/guardar as cópias age reais em meios independentes e ensaiar recuperação.
- Verificar volume persistente, TLS, role/ACL e capacidade em contexto autorizado.
- Autorizar captura/exportação real, realizar recuperação isolada com evidências
  e medir RPO/RTO/carga. Sem isso, gate de backup real permanece NÃO comprovado.
- Partições de rede e SIGKILL têm limites descritos no runbook; nenhuma promessa
  de exatamente uma execução sob qualquer falha distribuída. Não misturar schedulers.

Plano de implantação com pontos de parada e recuperação, custos e calendário de
renovação estão no runbook. Nenhuma alteração remota de configuração foi executada;
a única escrita remota foi o E2E fictício no bucket previamente autorizado.
