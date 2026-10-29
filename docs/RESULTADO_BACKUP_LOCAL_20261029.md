# Resultado local — backup externo e template

29/10/2026. Base `ba08e27`, branch de desenvolvimento
`codex/dev-beta-reliability-20261028`. **NO-GO de produção preservado.**

## Evidência executada

| Verificação | Resultado |
|---|---|
| Build da imagem isolada PG18/Redis8.2 + age/rclone | Passou, execução sem root |
| Suíte de backup final | 16/16, 7,749 s, exit 0 |
| Regressão backend `node test/run.cjs` | 291/291, nenhuma falha, 7.984,415 ms |
| Contrato do template com código real | Passou; cinco fixtures incompatíveis rejeitadas; zero consultas/envios |
| `git diff --check` | Passou |

[Log do backup](evidence/backup-fixture-20261029.log). Fontes reproduzíveis:
`backend/backup/test_backup.py`, `compose.fixture.yml` e
`backend/scripts/check-reminder-template-spec.cjs`. A rede dos fixtures é interna,
sem portas publicadas e sem `.env`/chaves reais. Somente fixtures novos neste
projeto foram usados; a base local da aplicação não foi consultada.

Provas do ensaio:

1. PostgreSQL continuou recebendo escritas; dump e manifesto compartilham snapshot.
   Restauração em banco novo compara contagem/hash de todas as tabelas fictícias;
   constraint, texto UTF-8, JSON, chave estrangeira e horário Brasília conferidos.
2. Redis continuou recebendo transações durante `--rdb`; CRC válido e par de valores
   transacionais consistente na cópia. Lista de fila, hash de job, zset, set,
   stream e duas DBs capturados. TTL fictício preservado com tempo restante.
3. Criptografia `age` real, decrypt real e restauração sem TCP do Redis. Os valores
   persistentes coincidem; TTLs não participam da igualdade de manifestos.
4. Chave errada, corrupção de ciphertext e hash divergente rejeitados. Dump PG
   truncado aborta a transação e deixa zero tabelas no banco novo de falha.
5. Tar com traversal, symlink ou membro duplicado rejeitado. Banco existente,
   nome inseguro e alvo remoto recusados pelo restaurador.
6. Upload parcial e download divergente simulados: falha e ausência de COMMITTED;
   nenhum sucesso falso. Objetos locais existentes não são sobrescritos.
7. Configuração real sem autorização, alvo não fictício em modo fixture e ausência
   de configuração bloqueados. `plan` funciona sem ambiente/credenciais/rede.
8. Redis ocupado não recebe comando de snapshot forçado. Adaptador R2 testado por
   contrato com ferramentas interceptadas: host/prefixo, flags, credenciais somente
   no ambiente do subprocesso, sem senha PG no ambiente do rclone.
9. Monitor externo testado com double local: início/sucesso/falha; ausência de
   execução ultrapassa período/tolerância; monitor indisponível não confirma
   sucesso. Requisições não levam registros/logs e rejeitam redirecionamento.
10. Binários reais pg_dump, redis-cli, age e rclone disponíveis; rclone instalado
    reconhece Cloudflare. Isso não é prova de autenticação ou upload no R2 real.

A primeira rodada passou 14 testes. Na ampliação para 16, a inicialização fria
expôs um problema do harness: pg_isready no Unix socket considerava o servidor
temporário do initdb pronto antes do listener TCP. Healthcheck corrigido para
TCP explícito; rodada final do início passou 16/16. Um conflito com usuário Unix
preexistente `backup` também foi corrigido no build para `secretaria_backup`.
Nenhum desses ajustes alterou a aplicação ou a Railway.

## Não comprovado / não executado

- Upload/readback R2 real, regras de lifecycle/lock e restrições efetivas de token.
  O armazenamento dos testes é um diretório privado local, não um emulador S3.
- Entrega real de alerta WhatsApp, cotas, destinatário e monitor hospedado.
  O detector local é um double de contrato, não execução do motor Healthchecks.
- TLS/CA, role PostgreSQL, ACL de replicação Redis e headroom na Railway real.
- Backup/restore de dados reais, RTO real, reconciliação de efeitos externos.
- Agendamento cloud e drill semanal. Nenhum executor foi criado.
- Template submetido/aprovado, WABA/número reconfirmados ou envio fora da janela.

Nenhuma chamada OpenAI nesta entrega, nenhum WhatsApp real, nenhuma migração,
deploy, recurso pago, rotação ou mudança de configuração remota. Não foi repetida
a suíte de 333 integrações da aplicação, pois nenhum código funcional dela mudou;
o pacote recebeu sua própria suíte com PostgreSQL/Redis reais de teste.

## Decisões para resolver os bloqueios

Ver [procedimento e custos](BACKUP_EXTERNO_BETA.md) e
[checklist Meta](TEMPLATE_META_BETA_CHECKLIST.md).

- Confirmar proposta 6h/30d/7d e autorizar configuração futura de R2 privado,
  executor único e chaves atuais restritas; nada disso decorre do teste local.
- Escolher custo/canal: Healthchecks nativo com WhatsApp consultado por US$20/mês,
  ou avaliar outro gateway independente antes de contratar. Preferência de Pedro
  por WhatsApp está preservada; não foi ativado outro canal por conta própria.
- Depois da infraestrutura validada com artefato fictício, autorizar explicitamente
  captura real (RDB da instância toda) e restauração em ambiente isolado.
- Criar/submeter template pelo checklist e comprovar aprovação/contrato. Produção
  e teste de envio continuam exigindo autorização de publicação separada.
