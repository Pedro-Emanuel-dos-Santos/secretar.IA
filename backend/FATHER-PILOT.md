# Primeiro uso acompanhado — meta 04/11/2026

Objetivo: o pai de Pedro conseguir registrar novidades de projetos, acompanhar
pendências, organizar reuniões e receber lembretes pelo WhatsApp com continuidade.
A data é uma meta; a liberação depende das evidências abaixo.

## Caminho desta semana

1. Fechar o fluxo integrado local: informação + criação/alteração de pendência,
   confirmação, referência conversacional, histórico e consultas persistidas.
2. Avaliar interpretação com o provedor real usando somente cenários fictícios.
   `scripts/evaluate-subject-proposals.cjs --allow-provider` contém 15 casos;
   gerar `dist` com o código atual antes de rodar. Requer credencial válida do
   provedor, sem reutilizar credenciais antigas após a rotação.
3. Publicar a versão validada e verificar API, inbox e worker de lembretes.
4. Executar pelo WhatsApp de Pedro os percursos abaixo e comparar respostas
   com registros, origem, horário e estado de entrega.
5. Preparar acesso do pai: número destinatário, elegibilidade no ambiente Meta
   atual, fuso e apresentação das capacidades. Memória pessoal exige consentimento
   do próprio usuário; consentimento de Pedro não se estende ao pai.
6. Usar por dias consecutivos, revisar falhas e corrigir bloqueios antes de ampliar.

## Evidência mínima para liberar

- Registrar uma novidade e uma pendência, revisar e confirmar; consultar depois.
- Registrar contrato recebido e alterar a pendência existente, sem duplicá-la.
- Retomar com “agora vou revisar o contrato”, usando o mesmo registro.
- Registrar assinatura sem concluir tarefa por inferência; concluir só quando pedido.
- Consultar o que mudou e o que precisa de atenção, com dados atuais e origem.
- Criar, corrigir e cancelar reunião/lembrete; verificar fuso e entrega real.
- Confirmar recuperação após reinício sem repetir atualização ou envio aceito.
- Confirmar isolamento entre Pedro e o novo usuário, incluindo memória e histórico.

## Estado em 28/10

Os fluxos de atualização composta de pendência existente e retomada após consulta
estão locais. Ainda faltam avaliação real da interpretação, publicação dessa versão
e validação ponta a ponta no WhatsApp. A Railway foi consultada: cinco serviços,
sem alertas ou trabalho pendente; isso não comprova funcionamento de todos os fluxos.
Google Agenda, ligações e mensagens a terceiros não compõem esta primeira entrega.
