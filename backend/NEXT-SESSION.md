# Retomada da Secretár.IA — 21/10/2026

## Estado confirmado mais recente

- Incremento de linguagem natural concluído localmente: perguntas só sobre o detalhe ausente, confirmações hoje/amanhã no fuso, avisos por antecedência, séries curtas, singular/plural e orientação de conversa sem ofertas automáticas. TypeScript, build, 172 unitários e 184 integrações passaram. A revisão automática voltou a funcionar na retomada. Expectativa de texto do aviso atualizada mantendo asserção do horário real no banco. Ver NATURAL-CONVERSATION.md; avaliação com IA real ainda pendente.
- Acompanhamento horário do incidente Railway criado neste chat (acompanhar-recupera-o-da-railway), silencioso sem mudanças relevantes. Apenas consulta fontes oficiais e avisa sobre recuperação/orientações de segurança; não publica, muda callback nem troca/revoga credenciais. Usuário decidiu seguir código local e aguardar recuperação.

- Mais recente: agenda por cliente/projeto e período, incluindo intervalos personalizados ISO com fuso até 31 dias. subject_overview com agendaPeriod/rangeStart/rangeEnd usa agenda filtrada; sem período conserva visão geral. Consulta por pronome recente preserva cadastro e período. Desambiguação explícita cliente/projeto homônimos e rejeição de intervalos incompletos/conflitantes. Sem migração, deploy ou callback alterado. Ver AGENDA.md; avaliação com IA real pendente.
- Verificação desse incremento: build/TypeScript, 166 unitários e 184 integrações passaram; seis cenários específicos repetidos após o último ajuste passaram. Banco local isolado e provedores simulados.

- Mais recente: agenda por período (hoje/amanhã/semana/próxima semana/próximos sete dias), unindo compromissos, avisos de tarefas e retornos em espera sem duplicar alertas. MINHA SEMANA e outros comandos locais consultam sem IA. Limites locais de calendário, leitura isolada por contato/conta e contagens reais. Sem migração nova, publicação ou callback alterado. Ver AGENDA.md; IA real pendente.
- Validação da agenda: build/TypeScript, 161 unitários e 178 integrações passaram, incluindo cinco integrações específicas. Nenhuma chamada real a IA/WhatsApp nessa verificação.

- Mais recente: escolha de tarefa em dois turnos (“o segundo” → “pode concluir/cancelar”), persistida como Event task_selection_focus. Só fica ativa após envio aceito da identificação; TTL cinco minutos e lista original até quinze. Consumo e alteração são transacionais. Outra resposta enviada/lista nova ou tarefa alterada invalida uso. Sem migração. Build, 155 unitários e suíte de 173 integrações passaram; IA real pendente. Ver TASK-SELECTION.md.

- Mais recente: reagendamento parcial preserva dia/hora não alterado em tarefas e compromissos. Resolução de hoje/amanhã/depois de amanhã/dia da semana simples usa recebimento/fuso; períodos vagos pedem detalhe. Versão do registro protege contra correção antiga. Build e 153 unitários passaram; suíte de 167 integrações passou. Ver RESCHEDULE-PARTS.md. Sem migração nova, publicação ou teste de IA real.

- Direção de produto registrada em PRODUCT-ROADMAP.md. subject_overview reúne dados atuais, compromissos, tarefas explicitamente vinculadas e notas que mencionam o nome. Vínculo de novas tarefas/séries, correção/remoção de vínculo existente e seleção ordinal de lista enviada implementados localmente. Correção de vínculo exige título/ID inequívoco, sem ordinal ou alteração de série inteira.
- Usuário decidiu aguardar Railway, continuar código local e manter callback atual. Túnel/API/workers iniciados para teste temporário foram desligados; banco e Redis locais permanecem disponíveis.
- Verificação do incremento por cliente: build/TypeScript, 137 testes unitários e 141 integrações passaram; quatro cenários de cliente repetidos após o ajuste final também passaram. Provedores simulados e banco local isolado; interpretação com IA real ainda pendente. Nenhuma migração adicional necessária para este incremento.
- Incremento seguinte adiciona migração aditiva 20261021150000_tasks_by_subject, aplicada somente ao banco local isolado de testes. Novas tarefas podem criar ou reutilizar cliente/projeto pelo nome completo explicitamente informado; nome parcial de cadastro existente é recusado sem criar tarefa. Não há associação automática das tarefas antigas. Workers aguardam subjectId antes de consumir trabalho. Após publicar, testar criação com cliente, resumo, espera, conclusão e recorrência; IA real ainda precisa de avaliação dessas novas ações.
- Validação mais recente do vínculo de tarefas: build/TypeScript, 138 testes unitários e 149 integrações passaram, incluindo oito cenários novos. Ver TASKS-BY-CLIENT.md. A confirmação, a lista e o aviso mostram o nome do cadastro.
- Incremento seguinte: seleção ordinal de tarefas pelo snapshot Event da lista numerada enviada, validade de 15 minutos, apenas enquanto não houver outra resposta enviada. Revalida versão/estado/progresso/título/horário com lock antes de alterar. Sem migração nova. Build, 143 unitários e 155 integrações passaram; IA real pendente. Ver TASK-SELECTION.md para limites, inclusive escolha sem ação e outras entidades.
- Incremento mais recente: set_task_subject e clearSubject permitem corrigir/remover cliente de tarefa ativa sem reagendar ou reenviar. Audita IDs, bloqueia envio incerto e compromisso, exige pedido explícito e confere vínculo esperado do contexto. Snapshots passaram a conferir também subjectId; listas antigas sem esse campo exigem nova consulta. Build, 143 unitários e 162 integrações passaram; oito cenários específicos repetidos após o ajuste final passaram. Próxima suíte completa terá 163 integrações. Nenhuma migração nova. Ver TASKS-BY-CLIENT.md.

- Incremento local adicional: perfil/fuso por conta, edição/exclusão de notas, consentimento informado de áudio, medição de tokens, limpeza confirmada de conteúdo e resumo diário opcional. Ver `PILOT-V2.md` para limites e roteiro de testes. As novas ações ainda não passaram pela IA real nem WhatsApp.
- Railway foi acessada novamente: serviços online, porém novos deploys temporariamente pausados por “Limited Access”. PostgreSQL não possui acesso público e o painel mostrou ausência de backups nativos. Não foi aberto acesso público ao banco.

- A avaliação de 21 turnos com IA real passou na retomada de hoje. Usou dados fictícios, banco local isolado e WhatsApp simulado; nenhum envio real.
- Foram corrigidos campos nulos omitidos pelo modelo, consulta factual respondida diretamente sem buscar o cadastro e busca textual de compromissos com artigos/acentos. Identificador inválido continua sendo recusado, sem substituição silenciosa por outro registro.
- A API pública respondeu HTTP 200 e {"status":"ready"}. Isso confirma prontidão da versão já publicada, não a publicação dos incrementos locais.
- O painel da Railway mostrou: “Dashboard and API unavailable, builds paused. We’ve found the cause and are working on a fix.” Nenhum deploy ou push foi feito durante o incidente.
- Branch: codex/railway-ready-20261020. Antes das correções da retomada, HEAD=a80f75d e havia cinco commits locais acima do remoto. Consultar git log/status atuais.
- Migrações novas foram aplicadas apenas ao banco local secretaria_inbox_test. Banco pessoal e produção não foram migrados nesta retomada.

## Próximos passos

1. Conferir acesso e recuperação do painel/API da Railway. Se persistir o incidente, não presumir liberação de builds.
2. Conferir backup do PostgreSQL e revisar commits locais. Depois de autorizada a publicação, enviar a branch e acompanhar pre-deploy da API com as migrações aditivas.
3. Confirmar o commit ativo na API, inbox e worker de lembretes. Workers aguardam os novos campos antes de consumir trabalho.
4. Conferir /health/ready e executar teste controlado no WhatsApp autorizado: compromisso futuro, avisos, alteração, cancelamento e tarefa aguardando/concluída.
5. Somente após o teste real anunciar as funções como disponíveis.

## Verificação local

No backend: npm run check:pilot -- --integration. O comando aceita apenas banco local terminado em _test e remove credenciais dos provedores no ambiente dos testes. A opção --migrate-test exige --integration e aplica migrações somente nesse banco.

Para IA real: build atualizado e scripts/evaluate-business.cjs --allow-provider, com INBOX_TEST_DATABASE_URL local e AI_MODE=openai. Usa tokens do provedor; mensagens WhatsApp são simuladas.

## Referências e limitações

FOLLOWUPS.md explica o incremento; SESSION-20261021.md registra a etapa noturna anterior à validação real. Essa avaliação pendente no documento anterior agora foi concluída na retomada.

Número definitivo, template fora da janela, áudio na nuvem, retenção completa de dados e medição financeira por usuário continuam pendentes. Há medição de tokens e limpeza parcial de conteúdo no código local, descritas em PILOT-V2.md. Não enviar segredos ao chat. Antes de usar o build novo com o banco pessoal, fazer backup e aplicar as migrações; ele ainda não recebeu as migrações novas nesta sessão.
