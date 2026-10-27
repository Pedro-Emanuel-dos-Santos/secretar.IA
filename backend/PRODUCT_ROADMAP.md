# Secretár.IA — produto para autônomos e pequenos negócios

> Direção atualizada em 27/10/2026: consultar
> [ASSUNTOS-E-ACOMPANHAMENTO.md](ASSUNTOS-E-ACOMPANHAMENTO.md) e
> [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md). O próximo marco é acompanhamento por
> assunto com origem, histórico e próxima ação. As entregas históricas abaixo
> não comprovam que esse ciclo integrado esteja pronto.

## Direção escolhida

Assistente de tarefas e prazos do profissional pelo WhatsApp. Exemplos: lembrar de enviar orçamento, retornar uma ligação, comprar material e cumprir um compromisso. O usuário recebe seu lembrete; não enviamos cobrança, publicidade ou contato para terceiros em seu nome.

Promessa inicial: transformar uma mensagem em compromisso claro, permitir corrigir o horário e acompanhar a resolução. A confirmação precisa refletir o registro real. Não prometer envio garantido, operação 24/7 ou funções ausentes.

## Entrega atual

Comandos sem IA: AJUDA, MEU DIA, PRIVACIDADE, PARAR e RETOMAR. A pausa é por pessoa e número comercial. A retomada não reenvia automaticamente avisos vencidos durante a pausa. Há limite de atraso configurável (padrão: 60 minutos) para evitar disparos acumulados após indisponibilidade.

Proteções técnicas do piloto, configuráveis: 100 pendências, 50 novos avisos em 24 horas, 200 pedidos em 24 horas e 20 áudios em 24 horas, por pessoa/conta. Séries consomem uma posição por aviso. Comandos de controle e botões continuam disponíveis depois de esgotar a cota de interpretação. Esses limites não são um plano comercial nem garantem um teto de custos totais da plataforma.

- Texto: criar, consultar, adiar, cancelar e concluir.
- Recorrência limitada: diária, semanal e mensal, de 2 a 12 ocorrências incluindo a primeira, no horário de Brasília. Sem quantidade, a assistente pergunta. Meses sem o dia escolhido são pulados. Cada ocorrência é persistida com sua própria outbox na mesma transação; reentrega da origem não duplica a série.
- Cancelar série: cancela somente os avisos cujo envio ainda não começou. Concluir e adiar afetam apenas uma ocorrência. Séries de mesmo título pedem escolha.
- Áudio no piloto: referência persistida no webhook, download autenticado exclusivamente da Meta, limite de 5 MB e transcrição local com faster-whisper em CPU. O modelo local limita áudio a 90 segundos. API paga de áudio é alternativa explícita, sem fallback automático, e não está ativada. Arquivo de voz não é salvo no disco pela aplicação; texto transcrito e metadados ficam no banco. Habilitação explícita e lista de telefones permitidos, desativada por padrão nos exemplos. Datas relativas usam o recebimento da mensagem, inclusive durações faladas simples. O texto continua seguindo para o interpretador configurado. Falhas conhecidas pedem texto/novo áudio sem criar ação; falhas temporárias têm tentativas limitadas. Não há reconhecimento de identidade por voz nem garantia de precisão de transcrição.
- Lembrete na janela de atendimento: Concluir, Adiar 10 min, Adiar 1 hora.
- Botões são processados sem IA; o título visual do botão não decide a ação.
- Identidade, pessoa, número comercial, versão e estado são conferidos no banco.
- Adiar um aviso aceito pelo provedor gera uma nova versão, limpa a projeção de entrega e conserva um evento mínimo de histórico. Envio incerto não é repetido.
- Fora da janela: usa apenas o template aprovado configurado, sem anexar botões livres. O template atual de texto não possui botões.

Implementação atual validada em testes locais. Não representa publicação nem teste real dos botões na Meta. Reiniciar os processos a partir do build novo para disponibilizar; não executar workers duplicados no mesmo banco/fila.

## Próximas entregas e critérios de aceite

1. Ampliar recorrência após validar a versão limitada: prévia de datas, fuso escolhido por pessoa, dias úteis e regras de término por data. Não oferecer repetição infinita na versão atual. Revisar tratamento de avisos acumulados após indisponibilidade antes de ampliar o piloto.
2. Áudio: validar o fluxo real com a própria pessoa autorizada antes de ampliar. Acrescentar controle de duração, consumo por usuário e prazo de descarte de transcrições, com comunicação clara sobre processamento externo. Não enviar áudios de novos participantes ao provedor antes de informar e registrar a escolha deles. A lista de telefones do piloto não substitui esse fluxo de entrada.
3. Entrada no piloto: fuso confirmado, exemplos curtos para o trabalho, consentimento para avisos e saída simples. Persistir preferências de forma isolada por pessoa e conta. Resumo diário opcional, desativado por padrão.
4. Cobrança: planos e cotas aplicados no servidor, consumo verificável, período de teste claro e política de cancelamento. Nenhuma promessa de ilimitado ou cobrança automática no piloto atual.

## Condições para convidar clientes

Número e conta Meta aptos para o público escolhido, template aprovado, publicação estável, backup com restauração verificada, medição de consumo por usuário, instruções de privacidade e canal de suporte. Testar restauração, isolamento entre usuários e duplicação de webhook. A versão com número de teste é desenvolvimento, não um serviço pronto para vender.

## Experimento comercial

Cinco profissionais convidados por 14 dias, começando por tarefas internas e prazos próprios. Perguntar sobre esquecimentos recentes reais e acompanhar uso na segunda semana. Hipótese inicial de preço: R$19,90/mês, a validar com custos e entrevistas; cotas ainda não implementadas. Não publicar esse plano como oferta disponível.

Indicadores: ativação (primeiro lembrete realmente entregue), uso na segunda semana, criação sem ajuda, taxa de conclusão, falhas/duplicatas, atraso do processador separado da entrega e custo por usuário. Não interpretar status provider_accepted como delivered.

Referência técnica de botões: https://www.postman.com/meta/whatsapp-business-platform/request/x0kd1at/send-reply-button
