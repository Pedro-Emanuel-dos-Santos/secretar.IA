# Retomada da publicação

## Estado salvo

- Branch: `codex/railway-ready-20261020`.
- Pacote principal enviado: `3ea661c` (compromissos/avisos e memória de clientes).
- Incrementos locais posteriores: `0832e5f`, `6ff5b1d`, `3224651`, além do commit deste roteiro. Consultar `git log` e `git status` antes de enviar.
- Railway mostrou deploys temporariamente pausados. Não presumir que o pacote principal está ativo só porque o serviço aparece online.
- A migração nova foi aplicada apenas no banco local de testes. Não confundir esse banco com produção.

## Ordem de retomada

1. Conferir alterações locais, branch e situação da Railway.
2. Validar com IA real a pergunta “O que mudou na reunião com João?”. Os testes de domínio/contrato passaram, mas essa pergunta ainda não foi avaliada no provedor real.
3. Depois da liberação da Railway, conferir backup do banco, enviar os commits e acompanhar a migração aditiva no pre-deploy da API. Os workers aguardam os novos campos antes de trabalhar.
4. Confirmar o commit ativo nos três serviços: API, entrada e lembretes. Conferir `/health/ready` e erros de migração/inicialização.
5. Fazer um teste controlado no WhatsApp autorizado: reunião futura, aviso antecipado, aviso adicional, reagendamento, consulta de histórico e cancelamento. Usar horários que permitam observar os disparos.
6. Testar orçamento 500 → 650, repetição de 650 e consulta do histórico. Conferir que existe um único valor atual e nenhuma revisão extra pela repetição.

Não enviar credenciais ao chat. Templates fora da janela de atendimento, número definitivo e áudio na nuvem continuam com as limitações descritas em BUSINESS.md. Não anunciar as funções como ativas antes de confirmar o deploy e testar.
