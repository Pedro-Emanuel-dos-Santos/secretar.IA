# Desenvolvimento da Secretár.IA

Leia `docs/ROADMAP.md`, `docs/ARQUITETURA_ATUAL.md` e `docs/DECISOES_TECNICAS.md`
antes de escolher a próxima entrega. Atualize a evidência quando o comportamento mudar.

- O produto acompanha a vida e o trabalho pelo WhatsApp. Priorize ciclos completos
  de conversa, memória autorizada e execução verificável.
- Separe código local, código publicado, prova automatizada e prova de uso real.
  Não classifique uma capacidade como pronta pela presença de arquivos.
- Preserve isolamento por contato e conta comercial, origem, versão e consentimento.
  Uma fala da IA não comprova uma gravação ou entrega externa.
- Para mudanças funcionais, execute verificações proporcionais e registre resultados
  e limitações. Integrações usam somente banco local isolado terminado em `_test`.
- Agrupe trabalho em entregas úteis; não peça um teste manual a cada ajuste.
- Produção, participantes, envios reais, novas despesas e operações destrutivas
  dependem da autorização vigente do usuário para a ação concreta.
- Nunca publique segredos ou conteúdo privado desnecessário em logs/documentos.
  Não reutilize credenciais antigas após a rotação.
- Toolkit e FreeLLMAPI são ferramentas externas separadas. Não copie suas regras,
  dependências, hooks ou código para o produto automaticamente.
- Não faça reescrita geral. A auditoria de 28/10 propõe evolução incremental;
  propostas de arquitetura não significam implementação ou publicação aprovada.

Backend: `backend/`; continuidade operacional detalhada: `backend/NEXT-SESSION.md`.
Auditoria inicial: `docs/ARQUITETURA_ATUAL.md`, referência local `4d4c56b`.
Memória contextual v1: `docs/MEMORIA_CONTEXTUAL.md`. Similaridade permite recuperar
registros, nunca autoriza escrita. Preservar origem, consentimento, versão e exclusão.
Publicação/recuperação: `docs/DEPLOY_BETA_COORDENADO.md`; não reativar consumidores
antigos com estados/actions novos sem conferir o backlog e o plano de compatibilidade.
