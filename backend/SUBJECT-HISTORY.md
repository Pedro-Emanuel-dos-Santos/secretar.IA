# Histórico de projetos e pendências — 27/10/2026

Publicado código4401f60 nos três serviços em27/10/2026, todos Active e readiness
ready. Teste real de histórico confirmado: consulta completed, resposta aceita
e lida, antes/depois/atual com origem/data, zero chamadas IA e nenhuma mutação;
pendência versão1 e fatos revisão1 do Piloto preservados.
Estende search_facts com
includeHistory=true e sem factKey; usa as rotas de consulta já existentes.
Perguntas como “O que mudou no projeto Piloto?” recuperam mudanças persistidas
das pendências, além das versões dos dados factuais. Não alteram registros.

Consultas completas com nome explícito, como “O que mudou no projeto Piloto?”
ou “Histórico do cliente João”, são resolvidas antes da IA e da montagem de
contexto. O executor confere nome exato e escopo no banco, mesmo fora da amostra
de assuntos do contexto. Nome inexistente não seleciona outro projeto.
Pedidos compostos, negações, pronome ou histórico de um campo específico
continuam no fluxo normal. Esta otimização não cobre linguagem irrestrita.

Cada alteração mostra título, posição anterior, posição após aquela alteração,
situação atual e origem/data da mensagem. Concluir uma pendência posteriormente
não faz a posição intermediária parecer atual. O relato continua atribuído ao
usuário; não comprova fatos externos, assinatura ou decisão formal.

A consulta filtra Event por contato, conta, assunto e tipo. Confere também o
escopo da SubjectPending e da mensagem de origem. Eventos incompletos ou com
origem incompatível não são apresentados. Não recupera dados factuais apagados
por meio do payload de eventos. Consultas específicas de orçamento/status/etc.
continuam restritas ao campo informado, sem misturar outras pendências.

Limites: examina as16 alterações mais recentes, mostra até3 e até1800 caracteres
para a seção de pendências; resposta total mantém limite3500. A lista parcial
é indicada. Não inclui nesta seção criação de pendência, agenda, anexos ou
histórico municipal completo. A interpretação geral ainda pode chamar IA;
o conteúdo do histórico vem do banco, não de uma resposta livre do modelo.

Testes direcionados: antes/depois versus conclusão posterior, isolamento entre
contatos/contas, consulta por campo, ambiguidade entre assuntos e origem alheia.
 TypeScript,246 unitários e269 integrações na suíte completa inicial aprovados; os quatro
testes direcionados passaram na revisão final. Não somar repetições como testes
distintos adicionais.
Após a otimização de consulta direta:248 unitários e cinco integrações afetadas
aprovados, incluindo inbox sem IA, nenhum efeito na pendência e outra conta.
TypeScript aprovado; não foi repetida a suíte completa de integração nesta etapa.
Ver test/subject-pending-history.integration.cjs. Sem migração, callback ou
credencial nova. Exige publicação e teste real antes de declarar disponível
no WhatsApp.
