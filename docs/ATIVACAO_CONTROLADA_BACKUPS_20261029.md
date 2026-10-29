# Backups — infraestrutura em plan, sem exportação real

29/10/2026. Autorização: criação do serviço isolado, volume Hobby e monitor
gratuito; notificações reais somente em check de teste. Não autoriza captura,
restauração de dados reais, cron real, mudança de bancos/credenciais ou deploy
da aplicação. Código do executor fixado em `9a4e2c8`.

## Railway: recursos criados

Plano Hobby confirmado na sessão autenticada ANTES do provisionamento. Não houve
upgrade. Sem alterações pendentes preexistentes no ambiente.

| Recurso | Configuração efetiva |
|---|---|
| Projeto / ambiente | cheerful-heart / production |
| Serviço novo | secretaria-backup — bda8a90a-6859-4706-90e8-84a601d1b8ec |
| Volume exclusivo | secretaria-backup-state — 20acd976-ba4f-41e0-a228-5147b6f080eb |
| Volume / região | 1000 MB, /state, ams; não compartilhado com bancos |
| Código | 9a4e2c8cf3900c196313cc300e499f1afcc9e769, pin explícito; pushes dev não publicam |
| Build | Dockerfile em /backend/backup; sem build da API |
| Execução | uma réplica configurada, limite 1 vCPU / 500 MB; comando plan |
| Restart / cron | NEVER / nenhum agendamento |
| Acesso público | nenhum domínio, proxy TCP ou porta pública criada |
| Configs locais do serviço | somente BACKUP_STATE_DIR, TMPDIR e RAILWAY_RUN_UID |
| Segredos / fontes | nenhum PG, Redis, R2, Meta, OpenAI, identidade age ou URL de monitor injetado |

Deploy exclusivo do serviço novo: `5572500e-32bc-46ae-a16c-017872e062ba`, SUCCESS.
Logs às 14:52:08 UTC comprovam `state_volume_writable_as_11001` e o plano:
`dataAccess=false`, `scheduleInstalled=false`, `realDataAuthorized=false`.
O processo terminou, sem réplica em execução contínua e sem ciclo de reinício.
Não confundir o rótulo Online/SUCCESS do painel com um job em execução.

O volume Railway nasce com dono root. Somente no serviço novo, o bootstrap
executa como root para atribuir /state ao UID11001 e imediatamente usa gosu para
executar o plano como secretaria_backup. Não muda imagem/permissões dos bancos.
Não mantém o executor de backup como root. A captura futura exigirá revisão do
comando e autorização separada; o comando instalado termina exclusivamente em plan.

## Custos apresentados antes de criar

Hobby continua US$5/mês com uso incluso; não existe nova assinatura para este
serviço. Tarifa de volume US$0,15/GB/mês: referência conservadora ~US$0,15/mês
para 1GB ocupado. A cobrança efetiva segue a medição de armazenamento, não é uma
taxa mínima adicional garantida. Execução plan curta consome CPU/RAM por segundos;
sem daemon ou cron. Builds são gratuitos na referência atual. Não houve tráfego
de backup de dados reais.

Healthchecks Hobbyist: US$0, até 20 checks, sem cartão/Business.
O cenário anterior ~US$0,80/mês refere-se a backups FUTUROS de 50MB/6h, não ao
consumo desta etapa nem a um teto. Não ativar custos/recursos adicionais por inferência.

## Monitoramento externo

Login concluído na conta do responsável, por link de acesso solicitado e recebido
por ele. Link não registrado aqui nem nos artefatos. E-mail externo existente
vinculado; nenhum token de API criado. Check preexistente preservado.

- `secretaria-backup-6h`: cron esperado `0 */6 * * *`, UTC, grace30min, email ON.
  Não recebeu ping: permanece NEW, não serve como prova de backup ou de captura
  ativa. A URL fica somente no painel autenticado; integração no job pendente.
- `secretaria-backup-TESTE-20261029`: período2min, grace1min. Somente este check
  recebe sinais fictícios para testar falha, ausência e recuperação. Nenhum ping
  representa captura/exportação real.

Notificações recebidas e lidas por Gmail, todas em 29/10/2026 (UTC):

| Hora UTC | Notificação | Prova |
|---|---|---|
| 14:54:08 | DOWN | Reason: received a failure signal |
| 14:54:31 | UP | corpo confirma recuperação do check |
| 14:57:31 | DOWN | Reason: success signal did not arrive on time, grace time passed |
| 14:58:25 | UP | recebimento após novo sucesso no check de teste |

O ensaio de ausência não enviou /fail: deixou expirar período2min + grace1min.
Dashboard também confirmou down após3min e depois up. Ao final, somente o check
de TESTE foi pausado; seus eventos permanecem disponíveis. Monitor principal
continua Never/NEW. O check preexistente não foi alterado. Foram quatro mensagens
automáticas do Healthchecks, nenhum email enviado pelo Gmail ou pela aplicação.
O teste usa pings HTTPS controlados, não executa a rotina de captura: o adaptador
do executor foi comprovado anteriormente por testes locais, ainda não pelo job real.

[Evidência sanitizada](evidence/backup-controlled-activation-20261029.json).
Nenhuma URL de ping, UUID de check, senha ou chave consta deste documento.

## Bancos: leitura de metadados e capacidade

Sem conexão SQL/Redis nem leitura de registros: o conector disponibiliza
configuração/metrics, mas não execução de consultas. Não há sessão CLI local
autenticada disponível. Não abrir acesso público nem copiar credenciais para
contornar essa limitação.

| Verificação (última hora, 61 amostras) | PostgreSQL | Redis |
|---|---|---|
| Imagem atual | postgres-ssl:18 | redis:8.2 |
| RAM atual / limite do serviço | ~0,0584 / 8 GB | ~0,0135 / 8 GB |
| Disco atual / volume | ~0,1639 / 5 GB | ~0,1943 / 5 GB |
| Rede pública | sem domínio/proxy TCP | sem domínio/proxy TCP |
| TLS observado na configuração | imagem preparada para SSL, handshake/CA/SAN não comprovados | comando de partida sem TLS explícito |

Capacidade observada favorável, insuficiente para provar carga do dump, fork/COW
e recuperação. Falta consultar INFO memory/persistence (sem SYNC/RDB), RSS real,
limites/ACL, latência e certificados. Não houve fork nem dump nesta etapa.

Não há role/ACL exclusiva de backup configurada no novo serviço. Privilégios
efetivos não podem ser inferidos de nomes de variáveis. Propor separadamente:

1. Validar PostgreSQL com verify-full, CA confiável e nome privado correspondente;
   consultar apenas pg_stat_ssl, privilégios da sessão e catálogo, sem linhas da aplicação.
2. Desenhar role de leitura/snapshot PG com acesso estritamente necessário,
   sem superuser, criação de roles/bancos ou migrações. Submeter grants antes de aplicar.
3. Redis requer TLS verificado e ACL compatível com INFO e replicação completa;
   replicação permite acessar TODA a instância, não só um prefixo. Não conceder
   ACL nem ativar TLS sem plano separado que preserve os clientes existentes.
4. Não relaxar verify-full/TLS, ampliar permissões ou reiniciar bancos para destravar
   o backup. Esses pontos continuam impedindo captura real segura.

## Identidade age: bloqueio físico conhecido

Pedro informou não possuir mídia offline nem cofre independente. Portanto a
identidade definitiva NÃO foi gerada, uploadada, enviada por e-mail ou colocada
no Windows/Railway. Duas cópias no mesmo PC não atendem ao requisito.

Ver [guia de guarda e ensaio](GUARDA_IDENTIDADE_AGE.md). Próxima ação do responsável:
providenciar mídia offline e escolher cofre criptografado externo acessível por
outro equipamento. Não contratar serviço ou comprar mídia automaticamente.

## Garantia de preservação da aplicação

IDs das implantações existentes antes e após provisionar o serviço novo:

| Serviço preservado | Deployment |
|---|---|
| API | 6ab19165-f02d-454a-b181-729dd5de3cd7 |
| Inbox | 1150569b-927b-472d-b64b-94a65e508c32 |
| Lembretes | 614ab584-6b70-4083-81d6-f0fb781dba11 |
| PostgreSQL | 666043b3-69f0-4119-8c90-a61e0d9118a9 |
| Redis | 1fe764e0-e8a5-49ba-ab08-009bd70ed1bc |

Nenhum deles alterado/reiniciado pelo agente; sem migração, envio WhatsApp ou
captura real. Locks/lifecycle/permissões R2 preservados. A única implantação
nesta etapa foi o serviço isolado em plan autorizado pelo usuário.

## Próximos pontos de parada

1. Testes de email concluídos e check de teste pausado; não reativá-lo sem novo ensaio.
2. Providenciar guarda age real e recuperação com cópia em outro equipamento.
3. Aprovar separadamente plano TLS/roles/ACL, após verificar metadados autenticados.
4. Somente nova autorização específica permite injetar credenciais atuais,
   capturar dados reais, restaurá-los em ambiente isolado e depois agendar.

Até lá: comando plan, ausência de credenciais, sem aprovação de dados reais,
cron ausente e monitor principal não iniciado. NÃO liberar beta pelo mero
sucesso de provisionamento ou recebimento de email.

Fontes: [Railway preços](https://docs.railway.com/pricing/plans),
[volumes e ownership](https://docs.railway.com/volumes),
[Healthchecks gratuito](https://healthchecks.io/pricing/).
