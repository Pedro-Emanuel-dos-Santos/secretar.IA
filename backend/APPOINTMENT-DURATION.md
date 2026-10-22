# Duração e conflitos na agenda pessoal

Incremento local de 22/10/2026, sem migração: Appointment.endsAt já existe.
Produção e callback não foram alterados.

- durationMinutes aceita inteiros de 1 a 1440 em criação/reagendamento de
  compromisso. A duração precisa ter sido declarada: “por uma hora”, “consulta
  de meia hora”, “duração de 90 minutos”. O servidor reconhece essas expressões,
  remove duração inventada e não usa “uma hora antes” como duração do evento.
- O rascunho conserva a duração enquanto falta dia/hora. Reagendar sem dizer
  nova duração mantém o intervalo original; mudar somente duração mantém início.
  Não há duração padrão inventada para compromissos antigos sem término.
- Antes de criar ou reagendar, a transação verifica conflitos na mesma conta e
  contato, sob o lock do proprietário já usado nas alterações. Duas criações
  simultâneas sobrepostas não podem ambas confirmar. A resposta aponta até três
  conflitos e pede outro horário, sem alterar o compromisso/avisos anteriores.
- Intervalos adjacentes são permitidos: 10–11 e 11–12 não se sobrepõem.
  Eventos cancelados, outra pessoa e outra conta são excluídos da consulta.
  Um evento sem fim conhecido bloqueia quando seu início está dentro do novo
  intervalo; não se presume por quanto tempo continua ocupado depois. Ausência
  de conflito não comprova disponibilidade de períodos desconhecidos ou externos.
- Alterar só antecedência do aviso não redefine duração nem bloqueia devido a
  sobreposições históricas. Reagendamento conserva antecedências e protege versão.
  Correção da duração no mesmo início não é descartada como falso no-op.
- Agenda, lista, confirmação, histórico e arquivo .ics mostram o término quando
  conhecido. Agenda diária inclui evento iniciado antes do período e ainda em
  andamento, com a data para não confundir um compromisso que virou o dia.

Limites: a sincronização Google ainda não está conectada. Este incremento consulta
somente compromissos locais; tarefas/lembretes não bloqueiam tempo automaticamente.
Não existe autorização para sobrepor compromissos intencionalmente nesta versão.
Expressões de duração não reconhecidas continuam dependendo de esclarecimento;
não equivalem a um interpretador irrestrito de intervalos por extenso.

Roteiro depois de publicar, com registros de teste:

1. “Reunião amanhã às dez por uma hora, me avisa meia hora antes.”
2. “Visita amanhã às dez e meia por meia hora.” → apontar conflito, sem criar.
3. “Visita amanhã às onze por meia hora.” → permitir adjacência.
4. “Muda essa reunião para durar duas horas.” → pedir alvo se foco for a visita;
   depois identificar reunião pelo título e verificar conflito antes de alterar.
5. Reagendar para outro dia; conferir duração, início e intervalos dos avisos.
6. Conferir agenda e exportação .ics com o mesmo término; cancelar itens de teste.

Validação automática usa PostgreSQL local isolado e provedores simulados.

Build e TypeScript aprovados, 213 unitários na revisão final e suíte completa de
216 integrações passaram. A última proteção de tipo de referência passou nos
unitários/build. Logs appointment-duration-final.log e
appointment-duration-unit-final.log na workspace. IA real e WhatsApp ainda
precisam ser avaliados antes de publicar. Nenhum envio real foi executado.
