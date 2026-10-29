# Roadmap priorizado — 28/10/2026

Estado operacional posterior em 29/10: [ativação controlada](ATIVACAO_CONTROLADA_BACKUPS_20261029.md).
Serviço isolado secretaria-backup + volume Hobby criados, pin9a4e2c8, somente plan,
sem cron/credenciais/exportação. Healthchecks gratuito configurado; testes reais
de email somente no check de TESTE. Chave definitiva depende de mídia/cofre que
Pedro ainda não possui. TLS Redis e privilégios mínimos continuam gates separados.
Nenhuma publicação da aplicação, migração, captura ou restauração real autorizada.
O relato histórico abaixo deve ser lido com esta atualização.

Integração operacional do backup em dev (29/10): compatibilidade R2 corrigida,
executor único e planos de e-mail/identidade/renovação preparados. 31 testes locais
e E2E de bancos fictícios → R2 → restauração passaram. Ver
[resultado](RESULTADO_OPERACAO_BACKUPS_20261029.md). Nenhum serviço/cron real ativado;
captura real recuperável e demais gates continuam pendentes.

Atualização 29/10: backup externo no Hobby em preparação local, conforme
[procedimento](BACKUP_EXTERNO_BETA.md) e [checklist Meta](TEMPLATE_META_BETA_CHECKLIST.md).
Política inicial 6h/30d/7d aprovada, sujeita à compatibilidade real do R2. E-mail
externo escolhido para alertas, sem Healthchecks Business. Pedro preparará R2 e
submeterá o template. Sem exportação real, deploy, serviços pagos ou nova
implementação grande; branch estável. Nenhuma configuração remota feita pelo agente.
Prova local não remove os dois bloqueios externos abaixo.

R2 posteriormente ativado por Pedro e configurado: bucket privado, 30d/7d em v1/,
token restrito cifrado e fixtures R2 verificados. Ver CONFIGURACAO_R2_20261029.md.
Captura real/restauração continuam ausentes; cliente rclone exige ajuste pontual
antes de integrar. Nenhuma automação ou publicação foi ativada.

Missão 04: [prontidão operacional](MISSAO_04_GO_NO_GO.md), 291 unitários,
333 integrações, jornadas com Redis real e dois checkpoints OpenAI. Corrigidos
isolamento entre contas, histórico de nota excluída e ambiguidade do aviso próprio.
Ensaio local de PostgreSQL/Redis passou; produção não tem backups e falta template
compatível. **NO-GO externo**, sem deploy. Próximo gate é backup real recuperável,
configuração Meta e publicação coordenada autorizada — não mais uma feature.

Progresso M03 na branch de desenvolvimento: revisão de regressões e primeira
recuperação contextual implementadas, com jornadas locais de vários dias.
Avaliação separada executada com OpenAI: 17 chamadas fictícias, US$ 0,0653804 de
US$ 0,10, após correções; ver AVALIACAO_INTELIGENCIA_BETA_20261028.md e suas limitações.
Próximas provas: backup/recuperação verificados; publicação coordenada autorizada;
jornadas integradas WhatsApp e participante. Nada disso ocorre automaticamente ao
publicar no GitHub. Novas avaliações pagas exigem autorização vigente de orçamento.

Meta: primeiro uso externo acompanhado até **04/11/2026**, sujeito aos critérios
de entrada. O calendário não transforma capacidades pendentes em prontas.

| Prioridade | Problema e entrega | Evidência para avançar |
|---|---|---|
| 1 — Entrega diária | Verificar template, nome, parâmetros e aprovação reais; tratar avisos bloqueados e testar fora da janela | Um lembrete realmente recebido depois da janela, com estado final correto; sem configurar template ou enviar sem autorização |
| 2 — IA previsível | Confirmar modo/modelo efetivos; corrigir seleção por JSON inteiro; medição de motivo/tentativas/latência e proposta de custo | Mesmos pedidos sob contextos diferentes preservam decisão; queda/fallback não duplicam ação; consentimento preservado |
| 3 — Continuidade útil | Recuperar assunto e posição persistida ao retomar depois; publicar fluxo composto local somente após avaliação | Jornadas entre sessões corrigem fato + pendência, não duplicam, citam origem e não usam resumo obsoleto |
| 4 — Qualidade integrada | Avaliação com provedor real e testes de vários pedidos, correções, ambiguidade, perguntas e falhas | Resultados por jornada e limitações; nenhum falso “feito”, gravação parcial ou acesso cruzado nos casos de liberação |
| 5 — Beta operável | Acesso do participante, consentimentos, controles de pausa/exclusão, suporte e gates de publicação | Participante independente realiza os percursos; operação identifica falhas e recuperação é exercitada |

## Sequência até 04/11

- 28/10: auditoria, lacunas e decisões documentadas; nenhuma mudança de produção.
- 29–30/10: implementar pacote de IA/observabilidade após revisão do plano;
  avaliar os fluxos locais e resolver dependência de template em paralelo às
  decisões de configuração. Não prometer aprovação externa da Meta nesse prazo.
- 31/10–01/11: publicação autorizada, teste integrado WhatsApp com Pedro e ensaio
  de recuperação; corrigir bloqueios antes de adicionar funcionalidades.
- 02–03/11: percursos externos acompanhados, consentimentos e verificação de dados
  separados; só adicionar participante e enviar mensagens com autorização.
- 04/11: liberar uso acompanhado se critérios passarem; caso contrário informar
  bloqueio concreto e manter o escopo que estiver comprovado.

## Depois do beta

Medir repetição de perguntas, sucesso sem ajuda, relevância de sugestões, entrega,
latência, custo e confiança. Evoluir recuperação/memória e proatividade opt-in;
depois Google Agenda. Equipes, papéis e integrações municipais são um produto
compartilhado mais amplo; dependem de demanda, acesso e viabilidade.

## Estado da etapa atual

Auditoria e proposta concluídas documentalmente. Não implementar todas as ideias
de uma vez. Não usar “cinco serviços online” ou contagem de testes como substituto
dos critérios do [plano beta](PLANO_BETA.md).
