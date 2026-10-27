# Atualização de runtime — 27/10/2026

As imagens padrão e o estágio Node da imagem opcional de áudio usam `node:24.22.1-bookworm-slim`. O contrato npm exige `>=24.22.1 <25`. Não basta reconstruir uma tag antiga em cache para comprovar a correção.

O lockfile atualiza body-parser 2.3.0 para 2.4.0, corrigindo GHSA-27r3-jxmh-p828 (negação de serviço com corpo comprimido). Nenhuma atualização geral de dependências foi solicitada. A auditoria npm das dependências de produção retornou zero vulnerabilidades conhecidas em 27/10/2026; isso não certifica o código ou a imagem inteira.

Foi feita uma reconstrução limpa com atualização dos pacotes openssl/ca-certificates do Debian. O smoke da imagem padrão confirmou Node24.22.1, UID1000, três entrypoints, ausência de .env e da configuração de heap de compilação no runtime. Usando o fetch do Node, HTTPS válido funcionou e os dois endpoints eMudhra indicados pela Render falharam com CERT_REVOKED. Não foi desabilitada a validação TLS.

A imagem de áudio opcional passa a exigir também certifi>=2026.10.19. Sua imagem completa, incluindo modelo Whisper, não foi reconstruída nesta rodada; não habilitar áudio local na nuvem com base apenas no teste da imagem padrão.

Fontes oficiais:
- https://nodejs.org/en/blog/release/v24.22.1
- https://render.com/docs/advisory-emudhra
- https://github.com/advisories/GHSA-27r3-jxmh-p828

Rollout: mesma branch de produção e mesmos comandos dos três serviços. Não há diferença de schema/migração em relação à versão de produção anterior. Confirmar o novo commit na API, inbox e lembretes e repetir o teste de conversa real antes de anunciar validação de ponta a ponta. Callback e credenciais não são modificados por esta publicação.
