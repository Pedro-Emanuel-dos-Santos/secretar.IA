# Secretár.IA — proposta de publicação na Railway

Preparado em 20/10/2026. Nenhum novo serviço, cobrança, push ou upload de segredos foi realizado nesta preparação.

## Conta e repositório conferidos

Workspace: Pedro Emanuel dos Santos's Projects, plano Hobby. A interface mostrou US$ 5 de crédito de uso e mensalidade Hobby de US$ 5. O repositório Pedro-Emanuel-dos-Santos/secretar.IA já está visível na integração GitHub. Não foi necessário ampliar permissões.
Dois projetos existentes foram identificados: ideal-trust (PostgreSQL) e radiant-nurturing (gestao-associativa e PostgreSQL). Nenhuma mudança foi feita neles. O fato de um banco estar isolado não significa que esteja disponível para reutilização; a proposta mantém a Secretár.IA separada.

## Configuração proposta

Novo projeto: secretaria-ia, um ambiente inicial de produção/piloto.

| Serviço | Origem | Execução |
|---|---|---|
| API | Mesmo repositório, Root Directory backend | railway.json / node dist/server.js |
| Entrada | Mesmo repositório, Root Directory backend | railway.inbox.json / node dist/inbox-worker.js |
| Lembretes | Mesmo repositório, Root Directory backend | railway.reminders.json / node dist/queue/reminder.worker.js |
| PostgreSQL | Serviço novo isolado, volume persistente | URL privada referenciada pelos três serviços |
| Redis | Serviço novo isolado, persistência a configurar/verificar | URL TCP privada referenciada pelos três serviços |

Uma réplica por processo. Somente a API ganha domínio HTTPS público. Nenhum domínio público para workers, PostgreSQL ou Redis. Iniciar pela API/migração e só depois os workers. Manter PostgreSQL e Redis na mesma região dos processos. Evitar suspensão automática dos workers, que precisam processar jobs no horário.

Vercel fica reservada para o futuro site/painel. Não precisamos de dois endpoints de webhook nem de uma migração para Vercel Workflow nesta etapa.

## Estimativa de custo, não orçamento garantido

Fonte oficial consultada em 20/10/2026: https://railway.com/pricing

- Memória: US$ 0,00000386 por GB/segundo, aproximadamente US$ 10 por GB médio/mês de 30 dias.
- CPU: US$ 0,00000772 por vCPU/segundo, aproximadamente US$ 20 por vCPU médio/mês de 30 dias.
- Volumes: US$ 0,00000006 por GB/segundo, aproximadamente US$ 0,16 por GB/mês.
- Tráfego de saída: US$ 0,05 por GB.

Hipótese de piloto: 0,6–1 GB de memória média total nos cinco serviços, CPU média baixa e poucos GB de dados/tráfego. Estimativa de planejamento: US$ 8–15/mês de consumo da Secretár.IA. Essa faixa precisa ser confirmada com métricas reais após 24–72 horas de operação e revisada com o crescimento. Cinco serviços não significam cinco mensalidades de plano, mas os recursos consumidos por todos são cobrados.

Os US$ 5 incluídos no Hobby são compartilhados com os demais projetos. A fatura total depende do consumo agregado e da regra de crédito do plano; não somar automaticamente US$ 5 a cada projeto nem presumir que a Secretár.IA cabe em crédito livre. Esta estimativa exclui OpenAI, tarifas da Meta, câmbio, impostos e eventuais taxas do cartão.

Não é um teto rígido. Nenhum limite global de gastos será modificado sem decisão explícita, pois ele poderia afetar gestao-associativa e outros serviços. É necessário aprovar um orçamento e as configurações de controle/alerta antes de criar recursos.

## Dados que precisam ir para a Railway

Somente após autorização de publicação, salvar no gerenciador de variáveis dos serviços necessários: WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_PHONE_NUMBER_ID, OPENAI_API_KEY, ADMIN_API_TOKEN, modo/modelo de IA e mapa explícito do destinatário de teste. DATABASE_URL e REDIS_URL devem ser referências dos novos serviços privados, sem expor as credenciais locais nem publicar .env no GitHub. Compartilhar cada segredo apenas com os processos que realmente precisam dele; API não precisa de chave OpenAI/token de envio quando somente recebe e persiste eventos.

Aplicar mínimo necessário: API precisa banco, Redis (healthcheck/rotas internas), App Secret, Verify Token, Phone Number ID e Admin Token. Entrada precisa banco, Redis, Phone Number ID, token de envio e chave/modelo de IA. Lembretes precisam banco, Redis, Phone Number ID e token de envio. Template só deve ser habilitado após aprovação efetiva na Meta. Nenhum desses valores deve aparecer no código, logs, screenshots ou commits.

## Antes da primeira publicação

1. Código local validado e atualização de segurança aplicada; preparar commit/branch revisável sem segredos.
2. Aprovar envio do código ao repositório GitHub existente e a criação dos cinco serviços com orçamento definido.
3. Aprovar transferência dos segredos listados para o workspace Railway do proprietário.
4. Criar ambiente, volumes, variáveis privadas e política de backup; registrar custo inicial.
5. Publicar API, conferir migrações e healthchecks; iniciar workers e verificar resumo operacional.
6. Configurar callback público somente após a API estar saudável, evitando workers locais e remotos simultâneos no mesmo banco/fila.
7. Fazer teste real somente com o destinatário próprio autorizado e confirmar entrega/recibo.
8. Validar um lembrete fora de 24 horas somente com template aprovado; rascunho em templates/secretaria_lembrete_v1.json.

O número atual é de teste; acesso público a assinantes e venda do serviço exigem preparação adicional. O piloto não está publicado só porque o repositório apareceu na lista da Railway.
