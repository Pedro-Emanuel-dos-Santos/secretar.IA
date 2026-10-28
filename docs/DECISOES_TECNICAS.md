# Decisões técnicas

Registro iniciado em 28/10/2026. “Proposta” não significa implementação aprovada.

## D01 — Preservar a arquitetura operacional

**Mantida.** Backend modular, PostgreSQL como fonte dos registros, inbox/outboxes,
Redis/BullMQ para agendamento e workers separados. Evidência: há deduplicação,
retentativa, versão e transações testadas. Reescrita geral acrescentaria risco
sem resolver recuperação contextual e qualidade demonstradas como lacunas.

## D02 — Proposta de assistente, execução pelo servidor

**Mantida.** Modelo não define sozinho identidade/versão/autorização nem afirma
resultado de ferramenta. Preservar confirmações contextuais válidas e operações
atômicas; melhorar a linguagem sem eliminar proteções de consistência.

## D03 — Consentimento de memória vinculado ao provedor

**Mantida na implementação atual.** Memória pessoal só entra no contexto com
aceite válido e AI_MODE=openai. Trocar para hybrid ou outro provedor não pode
compartilhar as mesmas memórias silenciosamente. Qualquer evolução precisa de
decisão de política e teste de revogação/exclusão/solicitação em andamento.

## D04 — Roteamento do beta

Atualização de 28/10: Pedro aprovou OpenAI principal e implementação local do
pacote. Roteador agora tem padrão openai e decisão híbrida pela mensagem atual.
Configuração remota continua sem alteração. Detalhes/evidências em
[entrega de confiabilidade](ENTREGA_CONFIABILIDADE_20261028.md).

**Aprovada em 28/10 para o beta; implementação local.** OpenAI principal explícita durante o beta;
não depender do Ollama no computador local. Validar primeiro modo/modelo remotos,
pois o conector só mostrou nomes de variáveis. Manter Ollama como opção futura
após endpoint hospedado e avaliação comparável. Não instalar serviço ou contratar
capacidade computacional nesta auditoria.

Critério: qualidade observada por jornada, latência, disponibilidade e custo.
Preferência pelo menor consumo não substitui qualidade. A heurística de >600
caracteres do contexto inteiro foi reproduzida e deve ser substituída por decisão
explícita sobre a tarefa. Não escolher um modelo novo sem avaliação.

## D05 — Observabilidade incremental

Atualização de 28/10: implementada localmente com migração aditiva em AiUsage,
registro de tentativas/motivo/fallback e estimativa USD versionada. Orçamento
financeiro e publicação permanecem pendentes; proposta original preservada abaixo.

**Implementada localmente em 28/10.** Reaproveita AiUsage, acrescentando motivo
de decisão e informação de fallback/tentativas sem prompt, respostas ou segredos.
Planejar migração aditiva se necessário. Medir duração, provedor/modelo e tokens
reais; custos estimados exigem tabela oficial vigente e versionada na implementação.
Propor limite financeiro e reação ao atingir o limite antes de ativá-los.

## D06 — Memória por recuperação, não histórico ilimitado

**Proposta.** Recuperar entidades/assuntos e registros com origem antes de
aumentar indiscriminadamente contexto. Resumo é material derivado e invalidável,
nunca substituto irreversível dos registros. Banco vetorial depende de evidência
de que a busca atual não atende e de política de exclusão das representações.

## D07 — Publicação e beta separados da compilação

**Mantida como critério.** Testes locais, avaliação de provedor, publicação e
validação real são evidências diferentes. checkSuites:false observado no serviço
indica que não devemos supor um gate remoto de testes. Propor gate explícito;
não alterar integração GitHub/Railway ou publicar nesta fase.

## D08 — Template fora da janela é dependência de produto

**Lacuna constatada, configuração a resolver.** Worker não lista nome de template;
código bloqueia envio fora da janela sem ele. Confirmar template aprovado e seus
parâmetros; a existência da flag APPROVED não basta. Configurar/publicar e testar
envio real quando autorizado. Não substituir por modelo Hello World e chamar de
lembrete funcional.

## Decisões que permanecem com Pedro

- Aprovar ou ajustar a política proposta de IA principal no beta e o pacote de
  roteamento/observabilidade antes da implementação dessa mudança arquitetural.
- Definir orçamento operacional e comportamento desejado ao atingir um limite
  financeiro; ainda não há teto de dinheiro implementado.
- Autorizar configuração/publicação concreta, template e teste de envio quando
  preparados; autorizar acesso do participante com número correto.
- Decidir expansão de escopo para áudio, Google Agenda ou uso compartilhado;
  recomendação é mantê-los fora dos critérios de entrada desta semana.

Autorizações anteriores continuam valendo dentro do escopo original; este
documento não cria confirmação a cada ajuste nem altera permissões da máquina.
