# Backup externo do beta — preparação em 29/10/2026

**Situação: implementação local em avaliação, ativação real NÃO autorizada.**
Manter Railway Hobby. Nenhum dado real foi lido, capturado ou exportado nesta
entrega. Nenhum bucket, plano, cron, credencial, template ou serviço remoto foi
criado/alterado. A existência deste código não resolve o NO-GO da Missão 04.

## Decisão de captura e disponibilidade, verificada antes da implementação

PostgreSQL: `pg_dump` custom, sem owner/ACL, com snapshot exportado de uma
transação `REPEATABLE READ READ ONLY`. O manifesto de linhas/hashes usa o MESMO
snapshot. Escritas comuns continuam; DDL concorrente pode causar espera/falha,
limitada por lock timeout. `pg_dump` não inclui roles globais nem a configuração
do servidor. Extensões, ownership e privilégios exigem revisão na recuperação.

Redis: `redis-cli --rdb` usa a sincronização inicial de replicação para obter um
RDB consistente. Não usa `SAVE`, `SHUTDOWN`, `CLIENT PAUSE`, alteração de CONFIG
ou parada dos workers. A instância continua atendendo; fork pode pausar brevemente
e copy-on-write consome memória. **Não é impacto zero.** A execução futura exige
limite de memória da instância confirmado, verificação conservadora de headroom
e ausência de BGSAVE/rewrite em andamento. Um teste pequeno não mede o impacto real.

RDB cobre **todas as bases lógicas da instância**, inclusive fora da DB da fila.
Antes de qualquer captura real, confirmar instância dedicada e autorizar esse
escopo; caso contrário, parar. PG e Redis não têm snapshot atômico entre si.

| Recurso | Evidência disponível | Pendência |
|---|---|---|
| Postgres/Redis Railway | Somente metadados: serviços existentes e nomes de variáveis; sem proxies TCP públicos | Credenciais específicas, TLS/CA, privilégios e capacidade não validados |
| Credenciais locais da rotina | Nenhuma variável BACKUP/R2/AGE disponível | Não reutilizar `.env` anterior à rotação |
| Cloudflare R2 | Pedro confirmou que não configurou | Conta, bucket privado, política e token restrito |
| Criptografia | Somente chaves efêmeras fictícias nos testes | Identidade real fora da Railway e duas cópias privadas recuperáveis |
| Agendamento | Só proposta, sem cron criado | Executor separado, na rede privada, uma única instância |
| Alertas | Pedro escolheu WhatsApp independente da aplicação | Conta/canal do monitor, número confirmado, orçamento e teste autorizado |

## Implementação preparada

`backend/backup/backup.py` não importa o backend nem lê `.env`. A imagem usa
PG18/Redis8.2 fixados por digest, Python/psycopg/redis e ferramentas `age` e
`rclone` dos pacotes Debian. O build instala atualizações dos pacotes; congelar
o digest final e revisar atualizações antes da ativação. Executa sem root.

1. Por padrão, `plan`: nenhuma conexão de dados ou cloud.
2. Captura real requer `BACKUP_MODE=real`, `--authorize-real-data` e referência
   de uma autorização ESPECÍFICA futura. Essas travas evitam acidente; não são
   um mecanismo de autenticação contra alguém que possa editar/executar o código.
3. Endpoints reais limitados à rede privada Railway; TLS verificado obrigatório.
   Se os certificados privados não permitirem isso, **parar**, revisar um canal
   seguro; não desabilitar validação silenciosamente nem abrir proxy público.
4. Diretório temporário privado/umask 077; captura PG, RDB e manifesto.
5. `redis-check-rdb` verifica CRC; Redis temporário com porta TCP **zero**, somente
   Unix socket privado, lê a cópia para calcular manifesto lógico por DB/tipo.
   Não compara bytes `DUMP`, que mudam de encoding sem mudar dados.
6. Bundle criptografado com `age` usando apenas chave pública do destinatário.
   Identidade privada não está no executor. Arquivos temporários são removidos
   ao sair normalmente/por erro; isso não equivale a apagamento forense. Usar
   scratch efêmero, sem volume persistente ou logs de conteúdo. SIGKILL exige
   descarte do filesystem efêmero do contêiner.
7. Upload em caminho único UUID, sem sobrescrever; download integral para comparar
   SHA-256. Só depois publica e confere `COMMITTED.json`. Captura validada não
   significa restauração validada: marcador mantém `restoreVerified: false`.
8. Publica somente artefato criptografado e marcador sem registros pessoais.
   Child processes recebem apenas a família de credenciais necessária.
9. Falha gera estado de erro e heartbeat `/fail`; sucesso somente após leitura de
   conferência. Se executor desaparecer, monitor externo percebe ausência.
10. Runtime total real limitado a 25 min. Configuração proposta: 6 h + 30 min de
    tolerância no monitor. Executor único; não configurar réplicas concorrentes.

Integridade autenticada do `age` protege contra corrupção. Criptografia com chave
pública **não autentica o remetente**: qualquer pessoa com a chave pública pode
criar um novo arquivo. Registrar o hash/UUID de cada captura em um registro externo
confiável sob controle separado. Não confiar apenas no marcador do mesmo bucket
comprometido; restaurar SQL desconhecido pode executar código. Esse registro e o
teste de acesso R2 ainda são requisitos de ativação.

## Armazenamento, retenção e permissões

Proposta: R2 **Standard**, bucket exclusivo privado, sem domínio público/r2.dev,
prefixo `v1/`, expiração automática após 30 dias e bucket lock de 7 dias. Multipart
incompleto expira após 1 dia. `retention.policy.json` descreve a decisão;
`r2-lifecycle.example.json` prepara a configuração S3, **não aplicada**. O lock é
configurado/verificado separadamente pelo administrador. Exclusão é assíncrona,
não promessa de apagar exatamente ao completar 30 dias. Revisar prazo de dados
apagados pelo usuário nos backups antes do primeiro participante.

Token de captura R2: Object Read & Write, somente esse bucket, sem permissão de
administrar conta/políticas. Essa permissão **inclui apagar objetos**; o runner não
chama delete, mas isso não torna o token write-only. Bucket lock protege o período
configurado, sem proteger contra administrador da conta capaz de remover regras.
Recuperação: credencial separada de Object Read Only, fora da Railway. Não dar ao
executor identidade de descriptografia ou permissão administrativa.

Postgres: criar futuramente role de backup com CONNECT e leitura das tabelas,
schemas e sequências necessárias, sem permissões de escrita. Verificar RLS e
privilégios no schema atual; não presumir que pg_read_all_data atravessa RLS.
Teste da captura não pode produzir backup incompleto silenciosamente. Redis:
validar uma ACL separada suficiente para PING/INFO e replicação inicial
(REPLCONF/PSYNC e eventualmente SYNC conforme versão). Replicação pode dar acesso
à instância toda; não prometer isolamento por key pattern. Não usar a senha
administrativa da aplicação como escolha automática. Nenhuma role/ACL foi criada.

## Monitor externo e WhatsApp

Adaptador preparado para Healthchecks.io, fora da Railway e da Secretár.IA:
`/start`, sucesso e `/fail` com UUID de execução; body vazio, sem logs/segredos.
Rejeita redirecionamentos e respostas que não sejam `200 OK` com body `OK`.
Não importa worker, fila, número remetente ou banco da Secretár.IA. Se Railway,
cron ou aplicação ficarem fora, a falta de sucesso pode disparar aviso pelo
monitor. É necessário habilitar e testar a integração WhatsApp no próprio monitor.

Plano Business consultado: **US$20/mês, 50 créditos SMS/WhatsApp**; cotas e
disponibilidade do canal devem ser conferidas ao contratar. Plano gratuito permite
monitoramento, mas não presumimos WhatsApp grátis. Nada contratado. Uma opção
mais barata com gateway independente exige decidir e validar outro provedor;
não foi implementada uma ponte improvisada usando o WhatsApp da aplicação.
O aviso ainda depende do monitor e da infraestrutura WhatsApp; independência da
aplicação não significa independência desses fornecedores.

Criar dois checks após autorização: captura a cada 6 h + 30 min; restauração
semanal + tolerância combinada. Vincular ambos ao canal WhatsApp; verificar aviso
por falha, execução ausente e retorno ao normal. O código de captura já tem o
adaptador; agendamento e check da restauração semanal ainda não instalados.

## Recuperação verificável

1. Com autorização de dados, obter somente um run COMMITTED, usando credencial
   R2 read-only em ambiente de recuperação separado. Conferir UUID/hash com o
   registro externo confiável. Nunca restaurar a captura mais recente por nome
   sem verificar procedência. Preservar a evidência anterior à intervenção.
2. Preparar PG18 vazio e Redis8.2 isolados, sem workers/webhook, tokens de Meta ou
   OpenAI e sem acesso à produção. Não montar sockets Docker dentro do runner.
3. Disponibilizar identidade `age` só nesse ambiente. `unpack` valida SHA, decrypt,
   três membros permitidos, tipos/tamanhos, hashes internos e CRC RDB. Rejeita
   path traversal, links e duplicatas. Chave errada/ciphertext alterado falham.
4. `restore-isolated` cria banco novo terminado `_test`, nunca sobrescreve banco
   existente; `pg_restore --single-transaction --exit-on-error`. Por segurança,
   esta versão aceita apenas o host de fixture `pg-test`; adaptar um ambiente
   real isolado exige revisão/autorização própria. Não aceita hostname Railway.
5. Recalcular contagens e hashes de todas as tabelas e comparar ao snapshot.
   RDB é carregado em Redis separado sem rede TCP; conferir tipos/ordem/scores/
   IDs de streams e valores persistentes. TTLs absolutos expiram com o relógio:
   CRC não valida que cada job ainda faça sentido, e manifesto exclui chaves
   transitórias da igualdade. Revalidar jobs e reconstruir fila com outbox/SQL
   quando apropriado; não supor que chaves expiradas devam ressuscitar.
6. Emitir evidência com versão, hash, tabelas/contagens, tempo, resultados e
   `outboundAllowed:false`. O drill não marca um backup remoto como recuperado.
7. Antes de qualquer retorno de envio: reconciliar SQL, inbox/outboxes, versões,
   jobs e mensagens aceitas/incertas desde a captura; PG e Redis não são atômicos.
   Reiniciar workers sem isso pode duplicar avisos externos. Recuperação de
   produção continua exigindo plano específico e autorização, nunca automática.

RPO proposto: intervalo nominal de até 6 h **quando capturas funcionam**; falhas
aumentam a perda potencial. Sem PITR. RTO real ainda desconhecido até restauração
autorizada com volume real. Ensaiar antes do beta e semanalmente depois, usando
executor de restauração fora da Railway e identidade fora do executor de captura.

## Execução dos testes fictícios

Na raiz do repositório, com Docker Desktop funcionando:

```powershell
docker compose -f backend/backup/compose.fixture.yml build tests
docker compose -f backend/backup/compose.fixture.yml up --abort-on-container-exit --exit-code-from tests tests
docker compose -f backend/backup/compose.fixture.yml down
```

Somente projeto `secretaria-backup-test`, rede `internal:true`, sem portas host,
sem montagem de `.env`, sem credenciais reais. Nenhum contêiner da aplicação é
parado. Bases são descartáveis em volumes anônimos criados pelo projeto; para
repetir com bases novas, remover APENAS os volumes desse projeto após confirmar
labels. Não usar `docker system prune` ou remover volumes da aplicação.

CLI padrão de imagem: `plan`. Com ambiente isolado de fixture preparado, o
restaurador aceita `restore-isolated --bundle ARQUIVO --identity IDENTIDADE
--trusted-sha256 HASH --target backup_restore_XXXXXXXXXXXX_test`; arquivos privados
devem ser montados read-only, scratch efêmero. Nunca colocar chave no argumento
ou na imagem; `--identity` recebe apenas caminho.

## Custos projetados, não medidos em produção

Preços públicos consultados em 29/10/2026, USD, impostos/câmbio não incluídos.
Railway Hobby continua mínimo US$5 com uso incluído; backup adiciona computação e
tráfego conforme uso, sem necessidade técnica de Pro para esta proposta. Referência:
RAM US$10/GB-mês, CPU US$20/vCPU-mês, egress US$0,05/GB.

R2 Standard: 10 GB-mês e franquias de operações gratuitos; excedente US$0,015/GB-mês,
Class A US$4,50/milhão, Class B US$0,36/milhão; egress R2 grátis. Franquia é da conta,
não dedicada ao projeto. Leitura de conferência também consome operações.

Exemplo, 4 capturas/dia e retenção 30 dias = cerca de 120 bundles:

| Bundle criptografado hipotético | Armazenamento estável aproximado | R2 armazenamento após franquia disponível | Egress Railway de upload/mês |
|---|---|---|---|
| 50 MB | 6 GB | US$0 | ~US$0,30 |
| 250 MB | 30 GB | ~US$0,30 | ~US$1,50 |

Operações/multipart e arredondamentos podem mudar esses valores. Runner hipotético
512 MiB por 5 min, 120 vezes/mês: ~US$0,07 de RAM, CPU até ~US$0,28 se 1 vCPU
usada integralmente nesse tempo. Não é orçamento fechado: tamanho, RAM do Redis,
tempo de hash/criptografia, CPU e banda reais ainda não foram medidos. Pode haver
uso já coberto pelos US$5 da conta ou cobrança adicional. Executor externo da
restauração e guarda de chaves também precisam de disponibilidade/orçamento.

Healthchecks WhatsApp nativo é o maior item fixo desta opção: US$20/mês. Portanto
**não prometemos backup com WhatsApp independente por custo total zero**.

## Gates e decisões de Pedro

1. Aprovar posteriormente criação do R2 privado e políticas 30/7 dias; definir
   responsável pela conta, MFA e chave de recuperação fora da Railway.
2. Escolher WhatsApp nativo no Healthchecks por US$20/mês ou pedir comparação de
   outro gateway independente antes de contratar. Nenhuma assinatura autorizada.
3. Aprovar separadamente preparação de executor e credenciais atuais restritas,
   validação TLS/ACL/headroom e teste R2/alerta com artefato fictício.
4. Só então autorizar captura de dados reais e seu escopo (RDB da instância toda),
   transporte/armazenamento e restauração isolada. Sem essa prova, NO-GO continua.

Fontes primárias:
[pg_dump/snapshots](https://www.postgresql.org/docs/18/app-pgdump.html),
[Redis CLI/RDB](https://redis.io/docs/latest/develop/tools/cli/),
[persistência Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/),
[age](https://github.com/FiloSottile/age), [rclone S3](https://rclone.org/s3/),
[R2 tokens](https://developers.cloudflare.com/r2/api/tokens/),
[R2 retenção](https://developers.cloudflare.com/r2/buckets/object-lifecycles/),
[R2 lock](https://developers.cloudflare.com/r2/buckets/bucket-locks/),
[R2 preços](https://developers.cloudflare.com/r2/pricing/),
[Railway preços](https://docs.railway.com/pricing/plans),
[Healthchecks preços](https://healthchecks.io/pricing/),
[Healthchecks API](https://healthchecks.io/docs/http_api/),
[Healthchecks notificações](https://healthchecks.io/docs/configuring_notifications/).
