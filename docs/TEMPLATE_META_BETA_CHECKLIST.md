# Template de lembrete — submissão preparada, não executada

29/10/2026. Pedro aprovou a direção para submissão, mas esta entrega prepara
checklist/arquivo. Nenhum template foi criado, credencial consultada, configuração
remota alterada ou mensagem enviada. A aprovação real da Meta ainda é bloqueio.

## Especificação final compatível com o código

Arquivo revisável: `backend/templates/secretaria_lembrete_v1.json`.

| Campo | Valor |
|---|---|
| Nome | `secretaria_lembrete_v1` |
| Idioma | Português (Brasil), `pt_BR` |
| Categoria solicitada | `UTILITY` |
| Parâmetros | POSITIONAL, um parâmetro de texto `{{1}}` no BODY |
| Outros componentes | Sem header, footer, mídia ou botões |
| Exemplo fictício de `{{1}}` | `⏰ Lembrete: Revisar o portfólio` |

Corpo exato:

> Você pediu este lembrete à Secretár.IA: {{1}}. Para ajustar ou concluir, responda a esta mensagem.

O código atual passa a mensagem inteira do lembrete, com espaços normalizados,
como um único parâmetro. Não dividir em nome/data/título sem mudar o contrato.
O exemplo não contém dados de participantes. Não usar o template para publicidade
ou conteúdo que a pessoa não solicitou. A Meta decide a categoria/aprovação;
compatibilidade local não garante aprovação nem entrega.

## Criar e submeter quando executar a etapa autorizada

- [ ] Abrir [WhatsApp Manager — modelos](https://business.facebook.com/wa/manage/message-templates/).
- [ ] Selecionar a conta comercial correta. Referência anteriormente registrada:
  WABA `1128643199613102`; remetente Phone Number ID `1384674954731707`.
  Reconfirmar associação atual; não presumir que IDs históricos ainda correspondem.
- [ ] Criar modelo; escolher Utilidade/UTILITY, nome e idioma exatos acima.
  Os títulos das opções podem variar no painel; não escolher Marketing para contornar bloqueio.
- [ ] Copiar somente o BODY exato; inserir uma variável numérica `{{1}}` e seu exemplo.
- [ ] Deixar header, botões, anexos e demais campos opcionais vazios.
- [ ] Conferir prévia: `{{1}}` recebe o lembrete completo. Submeter à revisão.
- [ ] Registrar ID do template, WABA, nome, idioma, categoria, data e status, sem token.
- [ ] Se ficar PENDING, REJECTED, PAUSED, DISABLED ou for reclassificado como
  MARKETING, parar esta liberação. Rever motivo/solicitar revisão ou novo texto.
  Não substituir por `hello_world` e não marcar approved=true por conta própria.

O arquivo JSON é especificação para revisão/possível submissão por API, não um
script: não executa POST. Documentação oficial da Meta foi tentada nesta sessão,
mas retornou HTTP429; não foi observada a UI autenticada atual. O checklist de
interface deve ser conferido ao executar. A validação local usa o código real.

## Validação somente de leitura após aprovação

- [ ] Confirmar `APPROVED`, `UTILITY`, `pt_BR`, POSITIONAL e exatamente um BODY
  cujo único parâmetro seja `{{1}}`.
- [ ] Com credencial atual autorizada e enviada apenas como Authorization header,
  consultar `GET /{WABA_ID}/phone_numbers` e confirmar remetente na mesma WABA.
  A validação de template atual não verifica essa associação automaticamente.
- [ ] Consultar `GET /{WABA_ID}/message_templates` filtrando o nome, com fields
  `name,status,language,category,parameter_format,components`, sem enviar mensagem.
- [ ] Verificar acesso do token/system user à conta/ativos e permissão
  `whatsapp_business_management` para metadados; `whatsapp_business_messaging`
  para envio futuro. Erro de consulta é bloqueio, não autorização para ignorar
  verificação. Outras permissões podem ser exigidas pelo fluxo de gestão do negócio.
- [ ] Salvar evidência sanitizada, inclusive retorno de erro se houver, sem
  cabeçalhos, URLs com token ou valores das variáveis privadas.

O probe existente `backend/scripts/check-whatsapp-template.cjs --allow-meta-read`
é somente leitura, exige build e ambiente atual já fornecido de modo seguro; não
lê `.env` sozinho. Não executá-lo agora com credenciais antigas ou para inferir
aprovação a partir do exemplo JSON. Sem `--allow-meta-read` não consulta a Meta.

## Configurar depois, com autorização de produção separada

No serviço **secretaria-lembretes**, revisar:

```text
WHATSAPP_BUSINESS_ACCOUNT_ID=<WABA realmente validada>
WHATSAPP_REMINDER_TEMPLATE_NAME=secretaria_lembrete_v1
WHATSAPP_REMINDER_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_REMINDER_TEMPLATE_APPROVED=true
```

Também confirmar `WHATSAPP_PHONE_NUMBER_ID`, token atual e App Secret já usados
pelo sistema, sem exibir/copiar no chat. O booleano true apenas habilita tentativa;
o worker consulta a aprovação real antes de usar o modelo. Não mudar API URL,
callback, tokens, API/inbox ou publicar por causa deste checklist. A atualização
de variáveis/reinício segue a autorização coordenada de publicação da M04.

## Prova de envio que exige autorização futura

- [ ] Backup real e restauração comprovados, demais gates de publicação resolvidos.
- [ ] Publicação coordenada autorizada; SQL/filas compatíveis, workers saudáveis.
- [ ] Destinatário autorizado, consentimento e eventual custo de mensagem aceitos.
- [ ] Criar lembrete solicitado com janela realmente fechada (não manipular
  timestamp de produção para simular >24h). Não precisa enviar agora.
- [ ] Conferir template utilizado, parâmetro e ausência de texto livre indevido.
- [ ] Correlacionar ID retornado e recibos HMAC `sent/delivered/failed`; `200` da
  API não equivale a recebido. Verificar telefone, WABA e horário/fuso.
- [ ] Falha temporária conhecida pode seguir retentativa controlada. Timeout de
  aceitação incerta exige reconciliação, sem reenvio automático cego.
- [ ] Registrar evidências e estado persistido final, sem dados privados.

Teste offline reproduzível, sem `.env`/rede/envio:

```powershell
cd backend
node --import tsx scripts/check-reminder-template-spec.cjs
```

Referências oficiais para reconferência quando acessíveis:
[Meta templates](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/),
[Meta permissões](https://developers.facebook.com/docs/permissions/),
[WhatsApp Manager](https://business.facebook.com/wa/manage/message-templates/).
