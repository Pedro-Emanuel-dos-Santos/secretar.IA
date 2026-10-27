# Direção aprovada — assuntos e acompanhamento

Atualizado em 27/10/2026. Esta direção complementa o produto pessoal pelo
WhatsApp; não representa uma decisão de construir todos os módulos municipais.
O briefing trazido por Pedro é referência de visão, não comprovação de recursos.

## Resultado esperado

A Secretár.IA acompanha um assunto ao longo do tempo: recebe uma novidade,
localiza o assunto certo, registra a origem, preserva o histórico, acompanha
pendências e recupera a situação atual. Respostas naturais continuam importantes,
mas a prioridade é entender, registrar e consultar corretamente.

O núcleo serve à vida pessoal e ao trabalho. Um piloto inspirado na rotina de
Planejamento pode usar dados fictícios. Uso institucional, compartilhamento entre
servidores e integrações municipais não estão autorizados por esse piloto.

## Base existente e lacunas

| Capacidade | Base observada | Próximo incremento |
|---|---|---|
| Identificar assunto | BusinessSubject, resolução por nome e foco recente | Avaliar referências ambíguas sem escolher cadastro por semelhança |
| Guardar informação | KnowledgeFact com versões e sourceMessageId | Consultas com origem/data e distinção entre relato, proposta e decisão |
| Acompanhar pendência | Tarefas vinculadas, progresso e espera | Relacionar atualização e próxima ação, inclusive sem prazo definido |
| Recuperar posição | subject_overview, fatos e agenda persistidos | Posição atual, mudanças e próximas ações no mesmo ciclo |
| Trabalhar em equipe | Escopo atual por contato/conta | Espaços, membros e permissões: trabalho futuro, não pronto |
| Documentos e parceiros | Não comprovados para este fluxo | Adiar RAG, Betha, GeoSimples e BIMHUB até validar o núcleo |

Essas bases não equivalem a gestão institucional completa. Não migrar dados
pessoais para uma memória compartilhada nem usar consentimento pessoal como
autorização institucional. Não renomear tabelas nem trocar a stack só pela visão.

## Primeira entrega: atualização de um assunto com continuidade

### Forma de entrega ao primeiro usuário

Pedro esclareceu que quer entregar ao pai uma versão útil para uso cotidiano,
não um roteiro de testes ou apenas uma demonstração. Os testes são responsabilidade
do desenvolvimento. A primeira versão de uso deverá integrar cadastro e consulta
de projetos, atualização com histórico/origem, pendências/próxima ação e agenda.
Não apresentar o incremento isolado de proveniência como esse produto completo.
O acesso ao WhatsApp dele só é preparado quando houver número informado e as
condições da Meta forem verificadas; não enviar mensagens sem combinar finalidade.

Antes de liberar essa versão: validar internamente o ciclo em várias conversas,
correções e nomes ambíguos, persistência após reinício, isolamento entre Pedro e
o pai, retomada após falha, prazo não inventado e consulta coerente ao dia seguinte.
Ele poderá usar exemplos de sua rotina, com dados fictícios ou pessoais adequados;
acesso e uso institucional de documentos/dados requerem definição própria.

Primeiro incremento em implementação local: consultas de fatos e resumo do assunto
mostram origem/data no fuso do contato; registros sem origem identificada são
rotulados como tal. Isso não implementa proposta composta, tarefas sem horário,
extração documental, confirmação formal ou acompanhamento autônomo.

Cenário fictício:

1. Cadastrar explicitamente o projeto Avenida Beira Rio.
2. Receber: “Conversei com Evandro. O contrato de doação da Avenida Beira Rio
   ainda não foi assinado. Preciso acompanhar na próxima semana.”
3. Reconhecer o projeto sem confundir com outro contrato. A fala é um relato do
   usuário sobre Evandro; não prova que Evandro autenticou ou confirmou nada.
4. Registrar a novidade com mensagem de origem e data, conservando a versão
   anterior. Uma assinatura pendente não deve sobrescrever todo o estado do projeto.
5. Propor acompanhamento. “Próxima semana” não autoriza inventar dia e hora de
   aviso: perguntar só o necessário. Pendência sem prazo deve poder existir sem
   um lembrete artificial, exigindo avaliar a modelagem atual de tarefas com aviso.
6. Quando houver ambiguidade ou mudança relevante, apresentar a proposta antes
   de executar. Uma confirmação deve ficar ligada ao assunto e à versão mostrados;
   se o registro mudar, revalidar. Não adicionar confirmações a toda ação simples.
7. Em outra conversa, recuperar a situação persistida e a próxima ação. Distinguir
   “não há confirmação registrada” de “não aconteceu”.

O primeiro registro composto de um campo factual e uma pendência sem prazo foi
implementado localmente, com proposta e confirmação (SUBJECT-PROPOSALS.md).
O ciclo amplo ainda não foi validado de ponta a ponta com IA real e WhatsApp.
Não prometer operações compostas arbitrárias com base nesse incremento limitado.

## Ordem de implementação

Proposta de informação + nova pendência sem prazo implementada localmente;
contrato e limites em SUBJECT-PROPOSALS.md. Ainda falta avaliação com IA real,
publicação coordenada da versão integrada e uso real validado; as fases abaixo
descrevem a direção, não uma comprovação de prontidão comercial/institucional.

Incremento seguinte implementado localmente em 27/10: SubjectPending separa
pendências de avisos, com próxima ação, espera, estados e resumo por assunto.
Detalhes e limites: SUBJECT-PENDINGS.md. Ainda não é a atualização composta com
proposta/confirmacão nem o produto integrado liberado ao pai de Pedro.

1. **Proveniência nas consultas:** mostrar quando e de qual entrada veio a
   informação; consultar versão atual para posição atual e versões anteriores
   apenas quando solicitado. Informação recente não substitui prova formal.
2. **Atualização proposta:** estruturar assunto, informação nova, pendência e
   acompanhamento sugerido; definir persistência da proposta, validade e consumo
   único. Confirmar contra a versão atual e evitar gravação parcial/duplicação.
3. **Pendência sem horário obrigatório:** separar trabalho a fazer de aviso;
   avaliar migração e compatibilidade com Reminder antes de implementá-la.
4. **Resumo por assunto:** situação informada, última atualização, dependências,
   próximos passos e lacunas. “O que mudou?” usa histórico, não texto inventado.
5. **Piloto completo:** validar primeiro com Pedro e exemplos fictícios sugeridos
   pelo pai. Só então decidir painel, documentos e recursos de equipe.

## Critérios de aceite do primeiro ciclo

- Dois projetos ou contratos plausíveis levam a esclarecimento, sem alteração.
- Correção mantém histórico e origem; repetição da mesma mensagem não duplica.
- Relato, sugestão da IA e decisão formal não são intercambiáveis.
- Nenhum prazo, responsável, conclusão ou documento é presumido.
- Proposta recusada/expirada não gera tarefa nem aviso; versão divergente exige
  revalidação; falha de execução não recebe confirmação de sucesso.
- Após reinício e em nova conversa, a consulta mostra a posição persistida atual.
- Outra pessoa/conta não consulta ou altera o assunto. Um futuro espaço de equipe
  exige autorização explícita e teste de permissões, não apenas compartilhamento
  de um telefone.
- Avisos mantêm cancelamento, idempotência e isolamento existentes.
- Avaliação com IA real e teste WhatsApp são registrados separadamente de testes
  automatizados com interpretação simulada. Uma demonstração não prova uso contínuo.

## Fora desta entrega

Trâmite oficial, decisões administrativas, análise jurídica conclusiva, acesso a
sistemas municipais, mensagens automáticas a terceiros, gestão de prefeitura
inteira, aprendizado silencioso e mistura de memória pessoal com institucional.
São possibilidades ou decisões futuras, não funcionalidades prometidas.
