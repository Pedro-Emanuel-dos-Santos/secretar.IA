# Mapa de capacidades — 28/10/2026

Estados: **Funcional e comprovada** = comportamento demonstrado na evidência
citada, dentro daquele escopo; **Parcial** = parte do objetivo funciona;
**Implementada sem validação** = código existe, falta a prova indicada;
**Ausente** = não foi encontrada implementação ativa do objetivo.
Prova local com provedor simulado não equivale a prova no WhatsApp.

| Capacidade | Estado | Evidência e limite |
|---|---|---|
| Entrada WhatsApp, persistência e deduplicação | Funcional e comprovada | Ciclo real anterior e inbox.integration; sem teste de carga externa nesta auditoria |
| Lembrete imediato no WhatsApp | Funcional e comprovada | Pedro confirmou recebimento; lembrete de um minuto, não operação contínua |
| Entrega fora da janela de atendimento | Parcial | Payload/template testado localmente; nome de template ausente no worker hospedado |
| Reagendar, cancelar e versionar avisos | Funcional e comprovada | management/reschedule/durability integrações locais; faltam jornadas externas completas |
| Tarefas e compromissos | Parcial | CRUD, fuso e duração testados; Pedro relatou inconsistência de apresentação UTC/local no histórico |
| Conflitos e sugestões de horário | Parcial | appointment-suggestions/slots; falta validação externa de agenda real |
| Notas pesquisáveis, corrigíveis e apagáveis | Funcional e comprovada | notes/management integrações locais; busca lexical limitada |
| Fatos de projeto com origem e revisão | Funcional e comprovada | Ciclo Piloto relatado e business/provenance testes; informação é relato do usuário |
| Pendências, pessoa aguardada e próxima ação | Funcional e comprovada | Piloto e subject-pending integrações; não agenda avisos por si só |
| Proposta: fato + nova pendência | Funcional e comprovada | Piloto confirmado por Pedro e testes atômicos |
| Proposta: fato + pendência existente | Implementada sem validação | 4d4c56b local, 19 testes de proposta; falta modelo real, publicação e WhatsApp |
| Retomada após consulta de pendência antiga | Implementada sem validação | Local, testes de continuidade; falta prova externa após publicação |
| Continuidade natural geral entre dias/assuntos | Parcial | Referências e memória persistem; histórico curto e recuperação lexical não cobrem conversa livre ampla |
| Memória pessoal com consentimento/correção/exclusão | Parcial | personal-memory integrações; restrita a AI_MODE=openai e falta uso externo sustentado |
| Aprender correções como preferência duradoura | Parcial | Atualização explícita existe; aprendizagem automática de preferências não implementada |
| Planos de várias ações | Parcial | 2–5 criações, transação e avaliação publicada 8/8; não planeja qualquer ferramenta e falta ciclo real confirmado |
| Sugestões contextualizadas | Parcial | Modelo recebe amostras e instruções; utilidade não medida longitudinalmente |
| Resumo diário opt-in | Implementada sem validação | daily-summary integrações; falta entrega real recorrente e dependência de template |
| Proatividade por assuntos/objetivos | Ausente | Não há política geral de sugestão com frequência, silêncio e avaliação de relevância |
| Roteamento OpenAI/Ollama no código | Parcial | Modos existem; heurística inadequada ao contexto serializado reproduzida sem rede |
| Ollama na hospedagem | Implementada sem validação | Cliente existe; serviço/endereço hospedado não evidenciados, sem probe de rede |
| Tokens e duração por chamada | Parcial | AiUsage e ai-usage testes; motivo, custo e tentativas de fallback incompletos |
| Recuperação de falhas e prevenção de duplicação | Funcional e comprovada | Durability/replies/schedule testes locais; envio incerto requer reconciliação, não garantia total em rede |
| Operação contínua e restauração | Implementada sem validação | Serviços online e scripts operacionais; sem exercício de restauração ou evidência de vários dias do beta |
| Separação por contato/conta e exclusão local | Funcional e comprovada | Testes cruzados e privacy; não certifica segurança nem papéis institucionais |
| Entrada por áudio em produção | Implementada sem validação | Pipeline e consentimento testados; configuração/allowlist no inbox não evidenciadas |
| Exportação de agenda ICS | Funcional e comprovada | calendar-export testes locais; é exportação administrativa |
| Google Agenda sincronizada | Ausente | Sem OAuth e sincronização bidirecional ativos |
| Chamadas, documentos gerais e mensagens a terceiros | Ausente | Entrada aceita texto, botão e áudio; sem essas ferramentas ativas |
| Equipes, papéis e memória institucional compartilhada | Ausente | Conta/contato não substituem organizações e permissões |
| Billing de clientes e orçamento financeiro de IA | Ausente | Limites de contagem existem; não são cobrança ou teto financeiro |

Detalhes e fontes: [arquitetura atual](ARQUITETURA_ATUAL.md). Rever estado após
cada publicação e demonstração real, preservando a diferença entre local e produção.
