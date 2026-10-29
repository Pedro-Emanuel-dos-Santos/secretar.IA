# Integração operacional dos backups — proposta de implantação

Atualização posterior autorizada: serviço isolado/volume e Healthchecks preparados
na [ativação controlada](ATIVACAO_CONTROLADA_BACKUPS_20261029.md). O serviço real
executa exclusivamente plan; cron e captura real permanecem desabilitados. Chave
definitiva pendente. O restante deste documento registra a proposta da entrega9a4e2c8.

29/10/2026, America/Sao_Paulo. Escopo exclusivo de backup. Nenhum serviço/variável
Railway, migração, cron remoto, assinatura, identidade real de recuperação ou
credencial foi criado/alterado nesta etapa. Somente fixtures usam o R2 autorizado;
não capturar/exportar PostgreSQL ou Redis reais. Publicar a branch dev não é deploy.

## Implementação preparada

`backend/backup/backup.py`: rclone R2 recebe `NO_HEAD=true`, substituindo apenas a
conferência HEAD pós-PUT que retornava HTTP501 no probe anterior. O HEAD de origem
continua habilitado (`NO_HEAD_OBJECT` não usado). O arquivo é baixado por inteiro,
SHA-256 comparado e só então se publica `COMMITTED.json`; esse marcador também é
baixado e conferido. PUT200 sozinho nunca produz sucesso. Não ampliar permissões,
remover lock ou reduzir retenção para fazer o cliente funcionar.

`backend/backup/executor.py`: execução única, com volume de estado e `flock` local,
mais advisory lock de sessão PG `731929/1` entre contêineres. Sem tabelas, migração,
grant automático, escrita em dados ou lease por Redis. Quem não obtém a trava sai
com código75 e não envia heartbeat que possa invalidar a execução já ativa.
Checa conexão da trava antes das fases críticas e periodicamente durante comandos;
conexão perdida não é reconectada silenciosamente. Interrompe antes de publicar.

Estado por UUID em `/state`, escrita atômica, fsync e modo0600. Registra fases,
sucesso/falha, interrupção, hash/tamanho e falha de monitor após storage verificado;
não inclui linhas do banco, credenciais, URLs de heartbeat ou exceções brutas.
Stdout também recebe eventos sanitizados para os logs do executor.

SIGTERM/SIGINT encerram o grupo de subprocessos e registram interrupção; limite
de 25min cancela execução excedida. SIGKILL não permite finally: conexão PG libera
trava quando o servidor detecta fechamento e a próxima execução identifica o estado
incompleto. Limpa somente scratch vinculado aos UUIDs abandonados, dono correto,
sem links ou caminho fora de `/scratch`; falha de limpeza mantém pendência e bloqueia
o próximo backup. Novo UUID, nunca sobrescrever/reaproveitar arquivo incompleto.
Artefatos remotos sem COMMITTED íntegro não são backups liberados para recuperação.

Travas e checagens não são uma promessa de consenso distribuído sob qualquer
partição de rede: pode haver intervalo até detectar perda de sessão. Por isso,
uma instância/scheduler, rede privada, timeouts, UUIDs únicos e bloqueio antes do
commit são obrigatórios. Não escalar réplicas nem executar dois agendadores.

## Executor proposto, NÃO criado

[Plano revisável](../backend/backup/executor.plan.json), não payload de provisionamento.
Um serviço cron separado na Railway Hobby, raiz `/backend/backup`, imagem deste
Dockerfile, uma réplica, sem reinício automático em falha. Agenda
`0 */6 * * *` em UTC (00h,06h,12h,18h). Railway pula um agendamento se a execução
anterior continuar ativa; o limite de 25min evita manter o cron preso por horas.

Montar volume persistente pequeno em `/state` (UID11001), scratch efêmero em
`/scratch`, TMPDIR apontando ali. Não compartilhar volume com PG/Redis ou workers.
Sem porta pública, webhook, socket Docker, API/inbox/worker ou chave privada age.
Secrets apenas do backup: credenciais de leitura PG, replicação Redis, R2 restrito
ao bucket, URL privada do check; destinatário age público. O executor não precisa
de tokens Meta, OpenAI, credencial administrativa, chave de recuperação ou e-mail SMTP.

CLI default `plan` não acessa dados/rede. Captura real requer aprovação específica,
`--authorize-real-data`, referência da autorização, TLS verificado, confirmação de
instância Redis dedicada/headroom e mounts corretos. `BACKUP_R2_CREDENTIAL_EXPIRES_ON`
obrigatório em modo real. Nenhuma dessas flags concede autorização nesta entrega.

Antes de autorizar a implantação: conferir limite/disponibilidade de serviço e
volume no Hobby, TLS/CA, privilégios das novas roles/ACL e capacidade de scratch/RAM.
Testes pequenos não estimam o pico real de fork/COW do Redis ou o RTO da produção.
Lease não para a aplicação, mas dump/manifesto e réplica RDB geram carga; medir.

## E-mail externo — preparado, sem conta/check criado

Recomendação: **Healthchecks.io Hobbyist gratuito**, 20 checks e 100 eventos por
check; usar e-mail verificado, fora da Railway e da aplicação. Não contratar
Business. [Especificação](../backend/backup/monitor.plan.json) ainda `applied:false`.

Na ativação autorizada:

1. Criar/acessar conta do responsável no Healthchecks e confirmar o endereço de
   e-mail de destino. Não usar a aplicação como remetente/servidor SMTP.
2. Criar check `secretaria-backup-6h`, cron `0 */6 * * *`, timezone UTC, grace30min;
   vincular integração e-mail. Guardar a URL de ping como secret do executor.
3. `/start` mede duração; `/fail` sinaliza falha explícita. Sucesso só após os dois
   readbacks/hashes. Falta do sucesso ou processo/Railway ausente é detectada pelo
   monitor independente; código de saída não substitui essa vigilância externa.
4. Habilitar lembrete de incidente aberto conforme opção gratuita disponível.
   Testar recebimento de falha, de ausência (deixar expirar um check de TESTE) e
   de recuperação; não suspender o cron real para testar o alarme.
5. Adicionar check semanal para o drill de restauração quando esse executor também
   for autorizado. Não marcar um backup restaurado apenas pelo sucesso de captura.

Adaptador mantém body vazio, UUID de run para correlação, HTTPS verificado e sem
redirecionamentos. Resposta `200 OK (not found)` ou rate-limit não confirma ping.
Mantida a regra atual: monitor indisponível no início impede iniciar captura
inobservável; registrar falha local. Se o monitor também estiver indisponível,
entrega de e-mail pode atrasar — não prometer aviso instantâneo nessa condição.
Monitor acessível e e-mail entregue de verdade ainda precisam de prova após
configuração autorizada. Os testes desta entrega usam double local, sem envio real.

## Identidade age independente do Windows e da Railway

**Preparação, não geração de chave real.** Não usar o envelope DPAPI da credencial
R2 como identidade age: são segredos diferentes. O job recebe somente destinatário
público `age1...`; a identidade privada nunca fica na Railway, Git, bucket de backup,
logs, e-mail ou chat.

Procedimento para o responsável, em estação Linux/offline confiável e mídia privada
fora do repositório (os caminhos abaixo são exemplos de um volume seguro montado):

```sh
umask 077
age-keygen --output /secure-recovery/secretaria.agekey
age-keygen -y /secure-recovery/secretaria.agekey > /secure-recovery/recipient.txt
age --passphrase --output /secure-recovery/secretaria-identity.age /secure-recovery/secretaria.agekey
```

A senha é digitada pelo responsável no prompt do age, não em argumento/env/chat.
Copiar `secretaria-identity.age`, `recipient.txt`, versões/fingerprints e runbook
para duas localizações independentes: mídia offline e cofre confiável fora do
Windows/perfil Microsoft e da Railway. Guardar a senha separadamente no cofre;
não automatizar sua entrada nem enviar por e-mail. Cópia não cifrada existe só em
volume seguro da estação de recuperação; depois de conferir as cópias, desmontar
o volume e descartar a área temporária conforme o mecanismo de criptografia dele.
Não tratar um simples `rm` como apagamento forense de SSD.

Em segunda máquina/Linux, sem acesso ao Windows original:

```sh
age --decrypt --output /secure-recovery/restored.agekey /media/offline/secretaria-identity.age
age-keygen -y /secure-recovery/restored.agekey
```

Conferir destinatário idêntico e descriptografar um bundle de fixture verificado,
com hash esperado guardado em registro independente. SQL vindo de origem não
confiável pode executar código; age de chave pública não autentica remetente.
Registrar responsável, localizações (sem senha), data, destinatário e resultado.
Só após esse ensaio, fornecer destinatário público ao executor. Manter identidades
antigas até os backups correspondentes e obrigações de retenção terminarem.

O E2E usa cópia portátil de identidade fictícia em Linux e remove o original antes
da captura no R2. Isso prova portabilidade/recuperação do formato, não que exista
hoje uma mídia física externa ou cofre com a identidade real do produto.

## Renovação R2 antes de 28/11/2026 — sem rotação nesta etapa

| Data alvo | Ação planejada |
|---|---|
| 14/11 | Começa aviso no executor: faltam até14 dias. Revisar responsável e acesso ao painel. |
| 20/11 | Preparar janela/credencial substituta com MESMO bucket e Object Read & Write; obter autorização. |
| 24/11 | Meta para troca autorizada, teste fictício e leitura de um bundle antigo. |
| 25–27/11 | Conferir execuções/alertas e revogar valor antigo só após prova e autorização. |
| 28/11 | Data de expiração registrada: executor conservador bloqueia uso a partir do início desse dia UTC. |

O painel confirmou a data, não horário exato; usamos o começo do dia como limite
conservador. Nenhum token foi consultado de novo, ampliado ou rotacionado agora.
Não foram criados lembretes/automação de renovação. Se a troca não ocorrer, monitor
detectará ausência/falha, mas não recuperará acesso sozinho. Não alterar lock ou
identidade age ao trocar uma credencial de armazenamento.

## Custos propostos antes de qualquer provisionamento

USD, 29/10/2026, exemplos de uso, não orçamento fechado nem limite de cobrança.
Mantém Hobby; seu uso incluso pode absorver parte do acréscimo.

| Item | Hipótese | Acréscimo estimado/mês |
|---|---|---|
| Monitor e-mail | Healthchecks Hobbyist | US$0 |
| RAM executor | 512MiB, 5min, 120 execuções | ~US$0,07 |
| CPU executor | 1vCPU efetivamente ocupada pelos mesmos 600min | ~US$0,28 |
| Volume estado | 1GB provisionado, conforme cobrança efetiva | ~US$0,15 |
| Egress Railway | bundle50MB ×120 | ~US$0,30 |
| R2 Standard | ~6GB retidos, franquia livre na conta e poucas operações | ~US$0 |
| **Cenário ilustrativo** | **bundle50MB** | **~US$0,80** |

Com bundles250MB: ~30GB retidos, ~US$0,30 de R2 após franquia e ~US$1,50 de egress;
mantidas hipóteses de CPU/RAM, ~US$2,30/mês adicionais. Volume real, limites, tempo,
memória Redis, tamanho/frequência de multipart e franquias compartilhadas podem
mudar o total. Egress R2 é gratuito; readback consome operações. Builds Railway são
gratuitos na referência consultada. Tributos/câmbio e executor externo de recovery
não estão nesses exemplos. Nenhum recurso pago foi criado por esta preparação.

## Plano de implantação e pontos de parada

1. Revisar entrega/custos; confirmar responsável e e-mail. **Parar sem autorização
   de criar executor/volume/check e injetar as credenciais atuais.**
2. Guardar/verificar as duas cópias age reais fora do Windows/Railway. Preparar
   roles/ACL/TLS/capacidade somente com autorização correspondente.
3. Criar um cron separado inicialmente desabilitado/`plan`, uma réplica e volume
   próprio; não conectar/publicar API, inbox ou lembretes. Validar monitor de TESTE.
4. Autorizar separadamente captura/exportação real (inclui TODA instância Redis)
   e restauração isolada. Sem isso, continuar usando apenas fixtures.
5. Executar uma captura manual, recuperar em ambiente isolado sem envios e conferir
   manifestos/estado persistido. **Parar em falha, dado inesperado, alertas não
   recebidos ou capacidade insuficiente.** Não habilitar cron por teste local aprovado.
6. Só após evidência real e autorização, ativar agenda6h e monitor. Acompanhar duas
   execuções, falha controlada de TESTE e recuperação; então registrar gate de backup.

Recuperação da rotina: desabilitar apenas o cron de backup, preservar journals e
objetos; interromper contêiner inteiro, aguardar liberação da trava, revisar falha.
Retomar com UUID novo e versão validada, nunca apagar COMMITTED/lock/retention ou
reativar envios após restore por conta própria. Nada disso foi executado remotamente.

Fontes: [rclone](https://rclone.org/s3/#s3-no-head),
[Railway cron](https://docs.railway.com/cron-jobs),
[Railway preços](https://docs.railway.com/pricing/plans),
[Healthchecks planos](https://healthchecks.io/pricing/),
[notificações](https://healthchecks.io/docs/configuring_notifications/),
[age oficial](https://github.com/FiloSottile/age),
[PG advisory locks](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).
