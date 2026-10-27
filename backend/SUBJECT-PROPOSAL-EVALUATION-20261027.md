# Avaliação da captura de propostas — 27/10/2026

Avaliação de interpretação com a OpenAI real e modelo configurado gpt-4.1-mini.
Dados fictícios, prompt candidato e respostas JSON; nenhum executor de domínio,
banco ou envio WhatsApp é importado pelo script de avaliação.
Credencial usada no próprio worker, sem copiar seu valor. O .env local antigo
não foi utilizado. Script reproduzível: scripts/evaluate-subject-proposals.cjs.
Requer --allow-provider; sem a opção não faz chamadas.

## Resultado e ajuste

- Primeira rodada:7/9 cenários aprovados;67918 tokens de entrada e766 de saída.
- Falha1: informação isolada com pedido explícito para não criar pendência foi
  classificada como proposta, sem título de pendência. O executor a recusaria.
- Falha2: atualização junto de aviso incompleto foi classificada como proposta.
  O executor pediria esclarecimento antes de gravar, mas a interpretação era ruim.
- Ajuste: regra final no prompt separa save_fact, create_subject_pending e
  propose_subject_update; proposta exige nova pendência explícita com título.
  Pedido composto com prazo/aviso incompleto deve esclarecer antes de registrar.
- Segunda rodada:11/11 cenários aprovados;85732 tokens de entrada e1473 de saída.
  Repete os nove anteriores e acrescenta informação isolada com outra redação e
  proposta envolvendo orçamento/Marcos, em vez de contrato/Evandro.
- As onze respostas também passaram no parseInterpretation atual da aplicação,
  sem executar as ações. Screenshot subject-eval-v2-20261027.png na workspace.
- As duas rodadas tiveram zero gravações em banco e zero envios WhatsApp, pela
  construção do avaliador (não executa o JSON retornado).

Também foram cobertos comentário sem registro, cadastro ambíguo, consulta de
posição atual e instrução de confirmação citada dentro de um documento.

## Limites da evidência

Uma execução por cenário em cada rodada; amostra pequena e sintética. Não é
taxa de acerto de produção, prova de uso recorrente nem teste completo da conversa.
Os controles de confirmação, transação, isolamento e rollback foram avaliados
separadamente pelos testes de domínio/inbox com provedor simulado.
O próximo teste real precisa passar pelo WhatsApp após publicação coordenada.

## Preparação de publicação

Backup lógico custom do PostgreSQL18 atual criado antes da migração17, lido
integralmente por pg_restore sem conexão a banco e copiado para o computador.
SHA256: d654c16626c6174681ca4573cd07977c8afea112a18a869fb34cf2cc8e0b8996.
Ensaio de restauração concluído em um PostgreSQL18 local sem rede/portas públicas.
Após migrar16→17:1 usuário,17 mensagens,1 compromisso,8 lembretes,17 respostas,
56 eventos,5 usos de IA e8 outboxes de agendamento preservados; fatos/cadastros/
preferências permaneceram vazios. Nova tabela SubjectPending presente. Banco de
ensaio parado depois da comparação.
Rollout0d9004f concluído em27/10:três serviços Active, health ready e migração17
aplicada. Consulta somente leitura confirmou registros anteriores preservados,
reunião28/10 às10–11 e aviso09:45 agendado. Conversa WhatsApp do novo ciclo ainda
em acompanhamento; não confundir esse teste pendente com o sucesso da avaliação.
Nenhuma mudança de callback ou credencial é necessária para este incremento.
