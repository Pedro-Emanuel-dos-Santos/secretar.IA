# Central de acompanhamento — 28/10/2026

Publicado código3f630cc, três serviços Active e readiness ready. TypeScript,253 testes unitários
e285 integrações aprovados. Inclui sete cenários de integração e três unitários
dedicados; não somar esses cenários novamente ao total da suíte.
Avaliação real de interpretação: sete cenários fictícios passaram no modelo
gpt-4.1-mini e no parser, sem ações ou mensagens; isso não comprova acurácia geral.
Prévia de leitura em produção renderizou o Piloto e o painel de atenção. Teste
real do novo painel no WhatsApp ainda pendente.

## Experiência integrada

- “Como estão meus projetos?”: status informado e sua origem/data, quantidade de
  pendências abertas, pessoas aguardadas e próximas ações de cada projeto.
- “Como estão meus clientes?”: a mesma visão restrita aos clientes.
- “O que precisa da minha atenção?”: tarefas abertas com aviso anterior,
  compromissos em andamento/próximos hoje, avisos do restante de hoje, esperas
  e pendências de projetos, incluindo ausência de próxima ação registrada.
- “Quem estou aguardando?”: reúne esperas de tarefas e pendências por pessoa ou
  referência informada, mantendo o assunto e a próxima ação disponíveis.

Perguntas comuns usam comandos locais antes da IA. Outras formulações podem
usar workspace_overview/overviewKind=projects|clients|all|attention|waiting.
O modelo escolhe a consulta; o executor produz o resultado com dados persistidos,
em vez de usar uma lista livre escrita pelo modelo. Consulta não envia cobranças,
altera pendências, configura notificações ou cria prazos/prioridades.

## Regras e limites

Toda consulta é isolada por contato/conta; cliente/projeto homônimos permanecem
distintos. Estados encerrados não entram nas pendências abertas. Horário de aviso
anterior não é tratado como prazo vencido ou prova de que algo não foi feito.
Espera antiga é descrita como tempo sem atualização, não como culpa da pessoa.
A data de recebimento e o fuso do contato definem o restante do dia.

Panorama mostra até seis cadastros atualizados recentemente e duas pendências
por cadastro, com contagens totais. Atenção mostra até três itens por categoria.
Retornos examinam até41 pendências e41 tarefas, exibem até seis referências e
dois itens por referência. Listas parciais são indicadas. Respostas têm limite
de tamanho. Campos de período/filtro em consulta interpretada exigem esclarecer
em vez de perder silenciosamente uma parte do pedido.

Não é um gerenciador municipal completo, uma agenda externa sincronizada ou
uma avaliação autônoma de prioridades. Os status continuam sendo relatos do
usuário. Sem migração ou nova credencial.

## Validação

Testes dedicados cobrem panorama, status com origem, isolamento entre contas e
contatos, separação cliente/projeto, agenda em andamento, avisos anteriores,
pendências sem próxima ação, listas extensas, ausência de mutação, inbox sem
IA e roteamento interpretado cuja resposta livre do modelo é descartada.
Avaliação real opcional e explícita: node scripts/evaluate-workspace-overview.cjs
--allow-provider, após build, com sete entradas fictícias e nenhuma execução
de ação. Não carregar chaves antigas do .env local para essa avaliação.
