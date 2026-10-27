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

Este ciclo ainda não está implementado e validado de ponta a ponta. Não prometer
registro composto de várias ações com base nos recursos isolados existentes.

## Ordem de implementação

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
