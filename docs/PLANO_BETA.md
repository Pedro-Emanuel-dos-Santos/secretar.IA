# Beta privado — critérios de entrada e avaliação

## Missão 04 — NO-GO operacional

Ver [relatório M04](MISSAO_04_GO_NO_GO.md) e [publicação](PUBLICACAO_M04.md).
291 unitários, 333 integrações locais, contexto real de banco fictício → OpenAI
→ proposta/confirmacão → persistência/fila real → transporte/recibo simulado,
mais restauração isolada comprovados. Falhas críticas de isolamento e reintrodução
de nota excluída foram corrigidas em desenvolvimento. Não publicar 2772da2 sozinho.
Os volumes reais não têm backups; falta template compatível e jornada hospedada
autorizada. Antes do participante: backup real/restauração privada, mesma release
nos três serviços, template com recibo fora da janela e consentimento próprio.

## Avaliação controlada OpenAI — 28/10/2026

[Relatório e prontidão](AVALIACAO_INTELIGENCIA_BETA_20261028.md): duas rodadas dos
oito cenários + uma repetição focal, 17 chamadas, US$ 0,0653804 estimados de um teto
de US$ 0,10. Oito resultados mais recentes aprovados; sete vêm da rodada 2 e um
da rodada 3, sem nova rodada completa sob o último ajuste do prompt. Modelo observado:
gpt-4.1-mini-2025-04-14, modo openai. 285 unitários, 331 integrações e build aprovados.
Código/evidências apenas na branch de desenvolvimento; nenhum deploy/migração/envio.
Continuam pendentes recuperação integrada no WhatsApp, template fora da janela,
backup/restauro, publicação coordenada autorizada e critérios do participante.
As notas abaixo registram a etapa anterior da M03, antes desta avaliação real.

## Atualização após Missão 03 — código local

Experimental: recuperação por conceitos em português e vínculos de projeto,
consulta antiga com origem e correção após consulta entregue/única. Não ativar
para o participante antes de publicar e provar as jornadas reais. A avaliação
real separada está em `backend/scripts/evaluate-context-memory.cjs`; sem flag é
dry-run, com flag requer orçamento estimativo explícito. Nenhuma chamada paga
foi feita nesta missão. A taxonomia não equivale a embeddings universais.

Além dos percursos abaixo, validar com Pedro: registrar memória consentida,
aguardar/retomar em outra sessão, consultar por paráfrase, corrigir e excluir,
pedir ajuda sobre entrevista, distinguir duas entrevistas e negar armazenamento.
Conferir resposta **e** registro/versão/efeitos. Medir perguntas repetidas,
recuperações úteis/erradas, ajuda necessária, latência, custo e satisfação diária.
O conselho deve ajudar sem afirmar execução; nenhuma proatividade nova foi ativada.

Usar [procedimento de deploy e rollback](DEPLOY_BETA_COORDENADO.md). Sem template
validado fora da janela, recuperação exercitada e isolamento real de participante,
o conjunto do beta permanece bloqueado. Dados simulados e serviços online não
substituem essas provas. Meta de 04/11 mantida, sem declaração de prontidão.

Atualizado em 28/10/2026. Complementa `backend/FATHER-PILOT.md`.
Participante previsto: pai de Pedro; inclusão e mensagens reais ainda não
autorizadas nesta etapa de auditoria. O objetivo é uso diário útil, com suporte
identificado, sem exigir conhecimento de comandos ou do desenvolvimento.

## Entrada

- Versão publicada identificável e mesma versão funcional nos três serviços.
- Avaliação de interpretação dos fluxos novos usando o modelo configurado e
  dados fictícios, sem ferramentas que gravem ou enviem mensagens.
- Reunião, aviso, alteração, cancelamento e continuidade demonstrados no WhatsApp;
  pelo menos um lembrete fora da janela com template apropriado realmente entregue.
- Participante elegível no ambiente Meta, destinatário correto e fuso conferido.
  Explicação clara de capacidades, limites e contato de suporte.
- Consentimento do próprio participante para memória e, se habilitado, áudio.
  Desativação e exclusão explicadas; nenhum aceite de Pedro vale pelo participante.
- Separação por contato/conta, confirmação e exclusão validadas com fixtures
  isoladas; nenhum dado pessoal de Pedro incluído em contexto do participante.
- Operação detecta falhas, bloqueios, atrasos e envios incertos; há procedimento
  para investigar sem reenvio cego. Recuperação e restauração precisam de evidência
  antes de confiar o armazenamento exclusivo de informação importante ao produto.

## Percursos automatizados e com provedor real

1. Informar situação do projeto, pedir acompanhamento, revisar e confirmar.
2. Informar avanço e atualizar a mesma pendência; verificar fatos, versão e origem.
3. Corrigir “não, era sexta às nove e meia”; preservar os demais campos e o fuso.
4. Retomar “e aquele orçamento?” depois de intervalo; recuperar ou perguntar só
   o necessário, sem escolher arbitrariamente entre dois assuntos.
5. Fazer vários pedidos na mesma mensagem; todos aparecem na revisão ou a
   limitação é esclarecida, sem perder silenciosamente uma parte.
6. Consultar “o que precisa da minha atenção?”; separar registro de sugestão,
   sem inventar urgência, prazo, pessoa ou conclusão.
7. Informar contrato assinado sem pedir conclusão; a tarefa não é concluída
   automaticamente. Testar negações, perguntas e instruções citadas em documentos.
8. Reinício, falha de banco/fila/provedor, confirmação repetida e versão concorrente:
   nenhum efeito duplicado ou metade da atualização persistida.
9. Pausar avisos, desativar memória e confirmar exclusão de fixtures; verificar
   que a outra conta/contato não foi afetada.

Suítes existentes cobrem partes desses percursos. Avaliações com modelo real
devem usar o mesmo parser e guardas do produto, não só comparar prose com regex.
Registrar fixture, versão, modelo observado, interpretação, resultado persistido,
resultado de envio, duração e classificação do avaliador. Conteúdo privado real
fica fora dos logs compartilhados; usar descrições mínimas na investigação.

## Avaliação do participante

Convidar a pessoa a organizar sua rotina por texto, sem fornecer uma lista de
comandos para decorar. Observar alguns dias de uso e pedir relato de onde precisou
repetir, corrigir, confirmar demais ou buscar ajuda. Não transformar o beta em
sequência de testes manuais a cada pequena alteração.

Medir sucesso por jornada, intervenções de Pedro, perguntas repetidas, alterações
erradas, avisos recebidos no horário, latência percebida e utilidade das sugestões.
Separar falha de interpretação, recuperação, execução, política de envio e operação.
Uma alteração feita no banco sem resposta entregue é resultado parcial.

## Bloqueios de liberação

Acesso cruzado, falsa confirmação de execução, gravação parcial, duplicação de
efeito, erro de fuso não resolvido ou aviso fora da janela sem caminho comprovado
bloqueiam o respectivo escopo. Sem template validado, não apresentar lembretes
futuros irrestritos como capacidade pronta. Não liberar funcionalidade marcada
como ausente apenas para cumprir a data.

Dados de teste automatizado usam conta e banco isolados. Limpeza de dados reais,
convite, envio e publicação dependem de autorização concreta. Exclusão local não
apaga automaticamente dados mantidos por Meta/OpenAI; não prometer isso.

## Evidência ainda necessária em 28/10

Modelo/modo efetivos na Railway, avaliação dos novos fluxos locais, template,
publicação de 4d4c56b, jornadas WhatsApp, recuperação/restauração e uso externo
por vários dias. Os serviços online não resolvem essas pendências por si só.
