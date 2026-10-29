# Cloudflare R2 — bucket privado configurado e validado

## Resultado final após ativação pelo usuário — 29/10/2026

Pedro ativou pessoalmente a assinatura R2 e autorizou retomar a configuração.
**Bucket criado e testado. Automação de backup, exportação real e deploy NÃO ativados.**
Nenhum PostgreSQL/Redis real foi consultado, copiado ou exportado. Nenhuma variável,
credencial ou serviço da Railway alterado; nenhum plano pago adicional contratado.

| Configuração | Resultado confirmado no painel |
|---|---|
| Bucket | `secretaria-ia-backups`, criado em 29/10/2026; nome disponível |
| Classe / localidade | Standard; Eastern North America (ENAM), seleção automática |
| Privacidade | Public Access Disabled; nenhum domínio personalizado; r2.dev desabilitado |
| CORS / Workers / migração | Nenhum acesso público, binding ou migração criado; opções pagas não ativadas |
| Lifecycle | `secretaria-expire-after-30-days`: `v1/`, excluir após 30 dias, Enabled |
| Bucket lock | `secretaria-protect-7-days`: `v1/`, 7 dias, Enabled |
| Multipart incompleto | `secretaria-abort-incomplete-multipart`: `v1/`, abortar após 1 dia, Enabled |
| Regra nativa anterior | Default Multipart Abort Rule de 7 dias mantida; a regra mais curta cobre `v1/` |

O prefixo `v1/` coincide com as chaves da rotina. A validação descartável usou
`validation/`, fora desse escopo; nenhum backup perdeu proteção para limpar testes.
Expiração é assíncrona; configuração de 30 dias foi verificada, não se simulou
passagem de 30 dias. Lock é política administrativa R2, não garantia de que um
administrador da conta seja incapaz de alterar a regra; o token de objetos não
recebeu permissão administrativa.

### Credencial e guarda privada

Um Account API Token `secretaria-backup-beta-20261029`, Object Read & Write,
somente `secretaria-ia-backups`, ativo até **28/11/2026**. Sem acesso administrativo
ou a todos os buckets. Filtro IP não definido, pois o executor/egress ainda não
foi escolhido. Essa permissão também permite delete fora do lock; não é write-only.

A primeira tentativa de guarda foi interrompida antes da persistência. Pedro
confirmou pessoalmente **Roll**; o valor anterior foi invalidado, sem ampliar
escopo ou validade. A nova credencial S3 foi guardada imediatamente e a recuperação
local foi verificada sem imprimir valores. Não foram criados tokens duplicados.

Guarda fora do repositório: `C:\Users\pedro\Documents\Codex\backup-private`.
Arquivo de credencial em envelope AES-256-GCM; chave AES protegida com RSA-OAEP-SHA256;
chave privada RSA cifrada pelo DPAPI do usuário Windows. Nenhum arquivo de credencial
em texto aberto, segredo no chat/log/commit ou alteração de ACL. O DPAPI vincula
a recuperação ao usuário/perfil Windows; isso NÃO substitui um cofre operacional
ou a identidade `age` de descriptografia dos backups. A identidade age real ainda
precisa ser criada/guardada separadamente antes de capturar dados reais.

### Testes executados contra o R2 real, somente fixtures

[Evidência HTTPS independente](evidence/r2-direct-validation-20261029.json),
[evidência do adaptador de backup](evidence/r2-validation-20261029.json),
[consulta restrita dos fixtures](evidence/r2-fixture-inventory-20261029.json).

- Fixture AES-256-GCM: upload, GET, SHA-256 e descriptografia idênticos ao original.
- Fixture `age`, 345 bytes: upload/download usando `Store` real da imagem local de
  backup, com SHA-256 e decrypt conferidos; nenhuma captura PG/Redis executada.
- Ambos: acesso S3 sem autenticação recusado com HTTP400; domínio público e r2.dev
  também confirmados desabilitados no painel. Nunca emitida URL pré-assinada.
- Objeto descartável: delete HTTP204; GET posterior HTTP404 no teste independente;
  listagem do prefixo vazio no teste rclone.
- Objetos protegidos em `v1/`: exclusão e sobrescrita recusadas com HTTP409 de lock;
  GET após as duas tentativas manteve o mesmo SHA-256. Proteção não foi removida.
- Conferidos só os caminhos exatos dos dois fixtures finais (308 + 345 bytes) e o
  prefixo descartável `validation/`, que terminou vazio. Não foi feito inventário
  amplo do bucket. Testes preliminares também deixaram pequenos fixtures em `v1/`
  antes de corrigir a expectativa de status HTTP403 para o HTTP409 retornado pelo
  serviço; eles também aguardam a política de retenção. Não há backup real ali
  criado por esta atividade e não se deve listar/apagar outros objetos para limpar.

### Compatibilidade encontrada — integração ainda pendente

O rclone 1.60.1 da imagem atual aceitou PUT e depois falhou com HTTP501 no HEAD
de conferência pós-upload. O HEAD independente sem esse contexto retornou HTTP200;
não há evidência para declarar todo HEAD do R2 indisponível ou atribuir a causa
exata a uma versão/parametrização sem novo diagnóstico.

O teste com o adaptador real passou com
`RCLONE_CONFIG_BACKUP_NO_HEAD=true` injetado SOMENTE no ambiente do probe. A leitura
integral e SHA-256 continuaram obrigatórios; não se considerou PUT200 como sucesso.
`NO_HEAD_OBJECT` NÃO foi necessário e a tentativa com ele não concluiu o download.

**O default do código NÃO foi alterado.** `Store` monta seu próprio ambiente e
hoje não propaga essa opção externa. Antes da integração, preparar um ajuste
pequeno e revisado que acrescente essa configuração ao ambiente do rclone (ou
validar uma versão compatível), preservando readback/hash/commit final obrigatório.
Depois repetir o probe. Esta etapa não publicou feature nem mudou a aplicação.

Fontes: [configuração rclone/R2](https://developers.cloudflare.com/r2/examples/rclone/),
[opções HEAD do rclone](https://rclone.org/s3/#s3-no-head).

### Custos e próximos passos

Assinatura ativada por Pedro: US$0 fixo + uso excedente. Standard oferece 10 GB-mês,
1 milhão de operações A e 10 milhões B na franquia; excedentes US$0,015/GB-mês,
US$4,50/milhão A e US$0,36/milhão B, mais tributos aplicáveis. Os testes usaram
arquivos de poucas centenas de bytes e poucas operações, compatíveis com a franquia
disponível na conta recém-habilitada. Não foi contratado Workers Paid, Business ou
outro serviço. O faturamento total futuro depende do uso da conta; não há hard cap
de gastos configurado por esta atividade.

Falta integrar, com autorização específica quando envolver recursos/produção:

1. Resolver a configuração do rclone descrita acima e repetir somente o teste
   fictício; código de aplicação/backup permanece estável nesta entrega.
2. Escolher executor único na rede privada, injeção segura da credencial S3 e cron
   de 6h. O envelope DPAPI local não é diretamente utilizável por um runner Linux.
3. Criar destinatário `age` real, guardar identidade de recuperação fora da Railway
   e definir registro externo confiável dos hashes. Rotacionar token antes de 28/11.
4. Configurar monitor externo/e-mail e testar falha, ausência de execução e recuperação.
5. Validar TLS/roles PG, ACL de replicação/headroom/dedicação do Redis. A criação do
   bucket não autorizou acesso aos bancos.
6. Obter autorização separada de captura/exportação real e restauração isolada.
   Até essa prova, NO-GO da M04 permanece. Template Meta/publicação têm seus gates.

Controles de revisão: alteração agressiva de ACL recusada; usada criptografia sem
mudar ACL. Rotação final exigiu ação de Pedro, concluída. Inventário amplo recusado;
consulta restrita aos fixtures autorizados passou. Nenhuma rejeição foi contornada
por API alternativa para executar a mesma ação negada.

## Histórico da consulta inicial, anterior à ativação (superado)

29/10/2026, America/Sao_Paulo. Consulta pela sessão autenticada da Cloudflare.
Somente navegação/leitura; não foram aceitos termos nem ativada assinatura.

## Resultado observado

O acesso autenticado funcionou. Ao abrir R2 Object Storage > Overview, o painel
redirecionou à tela de ativação (`/r2/plans`), com:

- botão **Add R2 subscription to my account**;
- **Total Due Now: US$0,00**;
- **Due Monthly: US$0,00 + additional usage**;
- cobrança somente acima dos limites mensais, assinatura com renovação automática,
  uso cobrado no método de pagamento e possível pré-autorização desse método;
- franquia Standard exibida: 10 GB/mês, 1 milhão de operações A e 10 milhões B;
- excedentes exibidos: US$0,015/GB-mês, US$4,50/milhão A, US$0,36/milhão B,
  mais impostos/taxas aplicáveis. Outras classes não usam essa franquia.

**R2 não habilitado.** US$0 agora não significa ausência de compromisso financeiro.
Pedro exigiu parar diante de cobrança/confirmação financeira; botão não clicado.
Nenhum custo novo foi autorizado, nenhuma assinatura/plano/recurso ativado.
Não foi confirmado se o cadastro precisará de novo cartão ou se há método em arquivo.

## Situação por item solicitado

| Item | Situação |
|---|---|
| Nome `secretaria-ia-backups` | Proposto; disponibilidade não confirmada antes de habilitar R2 |
| Bucket exclusivo privado | Não criado; privacidade ainda não validada |
| Domínio público / acesso anônimo | Nada configurado; no bucket futuro manter ambos desabilitados |
| Retenção 30 dias | Política aprovada; configuração preparada localmente, não aplicada |
| Proteção contra exclusão 7 dias | Política aprovada; compatibilidade/escopo reais não validados |
| Credenciais restritas ao bucket | Não criadas nem armazenadas |
| Upload/leitura/hash/exclusão fictícios | Não executados; dependem da ativação |
| PostgreSQL / Redis reais | Não acessados, copiados ou exportados |
| Railway / aplicação | Sem alteração de variáveis, serviços, credenciais ou deploy |

## Retomada após decisão financeira de Pedro

1. Pedro precisa decidir sobre a ativação de R2 com cobrança por uso. Se optar por
   ativar pessoalmente no painel, avisar após concluir; nunca enviar senha/chaves.
   Sem essa decisão, manter esta etapa parada.
2. Reabrir R2, verificar habilitação e disponibilidade do nome antes de criar.
   Só prosseguir dentro da autorização vigente, sem upgrade ou cobrança adicional
   nova. Escolher Standard, bucket privado, sem domínio público e sem r2.dev.
3. Aplicar/verificar lifecycle 30 dias e bucket lock 7 dias para os objetos de
   backup (`v1/`), sem reduzir proteções da conta. Confirmar permissões e limites
   da funcionalidade real. Nenhum lock/lifecycle deve ser descrito como efetivo
   apenas porque existe JSON local.
4. Criar acesso Object Read & Write restrito ao bucket, sem administração da conta.
   Essa permissão pode incluir delete: lock é proteção complementar. Guardar segredo
   somente em armazenamento privado fora do repositório; nunca no chat, logs ou
   relatório. Não copiar credenciais para Railway nesta fase.
5. Usar arquivo fictício realmente criptografado com chave de teste, comparar hash
   após upload/download. Para provar lock, exclusão de objeto protegido deve ser
   RECUSADA; não remover lock para limpar teste. Para exclusão efetiva, usar objeto
   descartável em prefixo de validação fora de `v1/`, mantendo todo backup coberto.
   Identificar qualquer fixture protegido que precise aguardar expiração.
6. Registrar evidência sanitizada de bucket, anonimato/domínios, políticas, escopo
   das credenciais e testes. Ainda faltará preparar executor, TLS/roles/ACL/headroom,
   destinatário/monitor externo de e-mail e guarda da identidade age fora da Railway.
7. Captura real, restauração com dados reais e publicação continuam exigindo
   autorização separada. Nenhum desses direitos decorre da criação do bucket.

Referência: [procedimento do backup](BACKUP_EXTERNO_BETA.md),
[preços oficiais R2](https://developers.cloudflare.com/r2/pricing/).
Evidência visual da tela foi mantida somente na workspace local, fora do repositório;
nenhum parâmetro de autenticação, token, segredo ou método de pagamento registrado aqui.
