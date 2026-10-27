# Correções da revisão independente — 27/10/2026

Base revisada: c5d4912. Mudanças locais; não publicadas.

## Comportamento corrigido

- Perguntas e propostas incertas como “Melhor nove e meia?” não alteram o item em foco por recuperação determinística.
- Duração composta como “uma hora e trinta minutos” preserva os 90 minutos. Expressões incompletas ou conflitantes pedem esclarecimento em vez de truncar.
- Intervalos numéricos no mesmo dia, como “das 9 às 10”, fornecem duração. O início deve coincidir com o horário interpretado no fuso do usuário; horários locais inexistentes ou repetidos são esclarecidos.
- Consentimento de áudio exige uma explicação recente, versionada, do mesmo provedor, vinculada à mensagem com resposta aceita para o mesmo contato e conta.
- Respostas concorrentes da mesma conversa usam claim serializado em PostgreSQL. A transação termina antes do HTTP; o estado persistido impede ultrapassar envio em curso.
- Filas de entrada e respostas continuam a varredura quando um contato está bloqueado. Limite de esforço: cinco páginas/100 registros por chamada.

## Limites preservados

- Aceitação pelo provedor não equivale a leitura da explicação pelo destinatário.
- `delivery_unknown` não é reenviado automaticamente. Um `sending` interrompido exige reconciliação operacional antes de liberar a conversa.
- A paginação não garante ausência de espera para mais de 100 conversas bloqueadas à frente.
- Intervalos por extenso, invertidos, qualificados ou múltiplos ainda podem pedir esclarecimento. Não há sincronização Google Agenda nem execução múltipla de pedidos nesta mudança.
- Testes com provedores simulados não comprovam a qualidade da interpretação da IA real.

## Validação

- TypeScript, compilação e 233 testes unitários aprovados. Suíte completa com PostgreSQL local isolado: 227 integrações aprovadas. Após revisão cruzada, teste adicional das duas ocorrências de início ambíguo passou na suíte direcionada de cinco casos.
- Testes de regressão incluídos na suíte padrão: `audio-consent.test.cjs`, `inbox.fairness.test.cjs`, `review-conversation.test.cjs`.
- Reproduções contra o código anterior confirmaram falhas dos novos cenários de conversa, consentimento e fila.
- Três testes PostgreSQL novos verificam ordenação concorrente, envio incerto e progresso de outro contato.
- Logs completos e relatório inicial ficam na workspace privada, em `work`, fora do repositório.

## Antes da publicação

Concluir a suíte local com PostgreSQL, revisar segurança do runtime/certificados e realizar avaliação com IA real usando dados fictícios. Depois publicar e testar no WhatsApp autorizado: reunião, aviso, correção, conflito, cancelamento e retomada. Não anunciar recursos como disponíveis apenas por estarem implementados localmente.
