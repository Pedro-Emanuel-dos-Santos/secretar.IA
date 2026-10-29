# Configuração Cloudflare R2 — bloqueada na ativação financeira

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
