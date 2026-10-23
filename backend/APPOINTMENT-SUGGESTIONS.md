# Alternativas após conflito de agenda

Incremento local, sem migração nem publicação. Usa Event para o snapshot
temporário; não altera callback nem conecta agenda externa.

Quando um pedido com duração conhecida conflita, a resposta pode oferecer até
três intervalos posteriores ao horário solicitado no mesmo dia do fuso do perfil.
Não há remarcação automática. A busca considera todos os eventos ativos do
contato/conta naquele dia, excluindo o próprio compromisso em reagendamento.
Inclui eventos com início anterior ao dia e término conhecido dentro dele.

Intervalos sobrepostos são combinados pelo avanço do cursor; adjacência é
permitida. Sem fim conhecido, o evento bloqueia o restante do dia na busca de
alternativas. Não se presume duração para eventos antigos de dias anteriores.
Opções respeitam duração real, arredondamento para minuto completo, fim do dia
local e antecedência dos avisos (para não propor um aviso que já venceria).
Mais de mil registros na janela impede sugestões, sem escolher de lista truncada.

Não são horários livres garantidos: agenda externa, deslocamento, horários de
trabalho e preferências informais ainda não são verificados por esse cálculo.
Nenhuma opção é prometida fora do dia pedido. Dias de 23/25 horas usam limites
reais de calendário; horas repetidas indicam offset para distinguir as escolhas.

## Escolha na conversa

“A segunda opção”, “opção 2” e “pode marcar a primeira” retomam o pedido
original persistido: título, descrição, duração, vínculo e avisos não vêm de um
palpite novo da IA. Uma negação/pergunta sobre as opções não autoriza alteração.
Seleção de tarefas não é reaproveitada como seleção de compromisso.

O snapshot só fica disponível após resposta aceita pelo provedor, no mesmo
contato/conta, por quinze minutos e enquanto nenhuma outra resposta for enviada.
Ao executar, o sistema revalida o snapshot sob o lock do proprietário e o consome
na mesma transação da alteração. Duas escolhas simultâneas não criam dois eventos.
Rollback devolve a opção consumida. O executor verifica conflitos novamente; se
o horário tiver sido ocupado, não marca e pode apresentar uma nova proposta.
Reagendamento também confere a versão do compromisso originalmente consultado.

Sem duração conhecida, não há cálculo de alternativas. As recuperações locais
de escolha cobrem as expressões descritas; não interpretam qualquer resposta
temporal livre como confirmação de uma opção.

## Validação real pendente

Publicar só depois de revisar o conjunto local. Roteiro com dados fictícios:
criar reunião com duração, pedir outra sobreposta, receber opções, escolher a
segunda e conferir título/horário/duração/avisos. Repetir com horário ocupado
depois da proposta e com desistência. Não usar compromissos reais importantes.

Validação concluída: 222 testes unitários, 224 integrações e build aprovados.
Após o último ajuste visual de offset em horas repetidas, unitários e build
foram repetidos com sucesso. Provedores simulados e banco local isolado.
Logs appointment-suggestions-final.log e appointment-slots-unit-final.log
na workspace. Avaliação com IA real e WhatsApp ainda pendente.
