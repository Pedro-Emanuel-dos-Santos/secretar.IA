# Direção: secretária pessoal no WhatsApp

## Incremento de 22/10/2026

A aplicação passa a ter memória pessoal separada de notas avulsas, cadastros de
clientes e lembretes. Categorias: rotina, preferência, pessoa importante e objetivo.
Um registro tem rótulo, texto, origem na mensagem e versão. As quatro ações
remember_personal, recall_personal, update_personal e forget_personal atravessam
o mesmo fluxo transacional do inbox, com resposta baseada no resultado salvo.
Nenhum agendamento é criado ao guardar uma preferência ou objetivo.

Não há aprendizado silencioso: depois da explicação e do consentimento, a pessoa
pede o que guardar. A identificação semântica continua com a IA; os executores
conferem autorização, escopo, versão, duplicação e limites. Mesmo rótulo/tipo com
conteúdo conflitante pede atualização explícita, sem sobrescrever por dedução.
Exclusão de uma memória não apaga mensagens históricas; a limpeza completa já
existente remove também memórias e registros de consentimento desta conta.

## Consentimento e dados

O proprietário autorizou esta funcionalidade neste chat sob a condição de cada
usuário consentir dentro do app. MEMORIA PESSOAL explica armazenamento e envio
à OpenAI, incluindo a possibilidade de informações sensíveis fornecidas pela
pessoa. ACEITO MEMORIA só ativa depois de a explicação ter envio aceito pelo
provedor, em até 24 horas e no mesmo contato/conta. Um “sim” não ativa nada.
Esta versão habilita personalização somente em AI_MODE=openai; troca de modo
bloqueia o envio das memórias. MINHAS MEMORIAS consulta localmente sem IA.

DESATIVAR MEMORIA interrompe novos usos. Os registros ficam disponíveis para
consulta/exclusão. O contexto omite as memórias, os turnos de operações de memória
e o histórico anterior à revogação, para não reenviar cópias em respostas antigas.
Em troca incompatível de provedor, o histórico curto fica omitido até configuração
compatível ou revogação. Requisições já iniciadas podem terminar. Isso não revoga
dados já processados por terceiros nem impede uso independente de dados que a
pessoa registrou em tarefas, compromissos e notas.

## Conversa e sugestões

O prompt passa a considerar família, descanso, objetivos e preferências ao ajudar
a pensar. Sugestões devem ter relação com o assunto atual, usar somente memória
confirmada e não virar oferta/cobrança em cada mensagem. Não há mensagens
proativas novas nem confirmação automática de tarefa feita ou medicamento tomado.
O modelo ainda precisa de avaliação real destes novos diálogos antes do piloto.

Roteiro com dados fictícios:

1. MEMORIA PESSOAL → ACEITO MEMORIA após receber a explicação.
2. “Guarda que prefiro resolver pendências pela manhã.”
3. “Guarda que quero reservar tempo para levar meu filho ao parque.”
4. “Minha semana está corrida, me ajuda a pensar nas prioridades?”
5. “O que você lembra sobre minhas preferências?”
6. “Atualiza essa preferência: agora prefiro resolver pendências à tarde.”
7. “Esquece essa preferência” → conferir retirada sem cancelar compromissos.
8. DESATIVAR MEMORIA → conferir contexto sem registros ou cópias do histórico.

## Google Agenda e outras integrações

Primeira ponte implementada: exportação administrativa autenticada de compromissos
ativos em .ics, sem alertas duplicados como eventos, isolada por contato/conta.
GET /calendar/export.ics?phone=DDIDDDNUMERO&start=ISO_COM_FUSO&end=ISO_COM_FUSO,
com Authorization Bearer do administrador no cabeçalho (nunca token na URL).
A conta comercial vem da configuração do servidor. Máximo 93 dias e 1.000
compromissos; erro pede período menor em vez de truncar silenciosamente.
Arquivo privado, Cache-Control no-store. Não existe link público de assinatura.

O Google permite [importar ICS pelo computador](https://support.google.com/calendar/answer/37118?hl=en).
Importação é uma cópia: não sincroniza edições/cancelamentos. O endpoint é uma
ferramenta do operador, ainda não um fluxo de conexão para clientes. Nada foi
enviado ao Google e nenhuma conta foi conectada neste incremento.

Próxima etapa: conexão individual via OAuth, consentimento e revogação, tokens
criptografados fora dos logs, leitura da disponibilidade e só depois gravação de
eventos com identificação e idempotência. Começar pelo menor escopo compatível,
como disponibilidade, seguindo os [escopos oficiais](https://developers.google.com/workspace/calendar/api/auth).
Não solicitar acesso completo ao calendário para apenas consultar horários.

Depois: detectar conflitos, propor horários com dados verificados, tratar eventos
alterados externamente e integrar calendário à agenda local sem dupla notificação.
E-mail, listas de compras e planejamento de rotinas ficam depois desse núcleo.

## Validação local

Build e TypeScript aprovados; 207 testes unitários e suíte completa de 208
integrações passaram. Após refinamento da proteção de histórico na revogação,
11 integrações diretamente afetadas foram repetidas e passaram, além de novo
build/unitários. Provedores simulados e banco local terminado em _test; nenhuma
memória real enviada à OpenAI, nenhuma conta Google conectada e nenhum deploy.
Logs personal-memory-final.log, personal-memory-unit.log e
personal-memory-targeted.log na workspace. Sem migração nova: registros usam
Event existente e a limpeza por contato/conta inclui os novos tipos.
