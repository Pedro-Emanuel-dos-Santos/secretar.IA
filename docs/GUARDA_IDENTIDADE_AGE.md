# Identidade age definitiva: preparação com o responsável

Status em 29/10/2026: NÃO gerada. Faltam dois meios de guarda independentes.
Este guia não autoriza a captura de dados reais.

## Preparar antes de gerar

- Meio A: mídia offline sob guarda física do responsável, fora do computador.
- Meio B: cofre criptografado externo, com acesso testado em outro equipamento,
  autenticação forte e mecanismo de recuperação conhecido. Definir o provedor
  antes de enviar qualquer material. Não usar Railway, repositório ou bucket
  dos próprios backups para guardar a identidade.
- Duas cópias do arquivo de identidade serão cifradas por senha longa exclusiva,
  digitada pelo responsável. Senha fora do chat, scripts, env, argumentos e logs;
  não guardar a única senha junto às duas cópias nem depender só deste Windows.
- Estação confiável com age; diretório temporário em volume criptografado ou
  RAM privada. Não gerar a chave em pasta sincronizada, repo ou diretório público.

O guia assume Linux confiável; `/secure-recovery` é um exemplo de volume
criptografado montado pelo responsável, NÃO um diretório criado automaticamente.

## Gerar com entrada de senha pessoal

```sh
umask 077
age-keygen --output /secure-recovery/secretaria.agekey
age-keygen -y /secure-recovery/secretaria.agekey > /secure-recovery/recipient.txt
age --passphrase --output /secure-recovery/secretaria-identity.age /secure-recovery/secretaria.agekey
sha256sum /secure-recovery/secretaria-identity.age
```

age-keygen com output grava a chave privada somente no arquivo. Compartilhar
com o executor SOMENTE o destinatário público, nunca secretaria.agekey. No prompt
interativo de age, o responsável escolhe/confirma a senha pessoalmente.

Copiar secretaria-identity.age e recipient.txt para ambos os meios, sem a identidade
em claro. Registrar versão age, hash do arquivo cifrado, destinatário público,
data, responsável e locais de guarda sem senha. O registro não substitui a mídia.

## Ensaio obrigatório em outro equipamento

1. Desconectar/desmontar a primeira estação. Acessar separadamente as cópias A e B.
2. Conferir o hash de cada arquivo contra o registro independente.
3. Em volume temporário protegido do segundo equipamento:

```sh
umask 077
age --decrypt --output /secure-recovery/restored.agekey /media/offline/secretaria-identity.age
age-keygen -y /secure-recovery/restored.agekey
```

4. Confirmar destinatário idêntico, repetir com a cópia B, descriptografar um bundle
   exclusivamente fictício cifrado para esse destinatário e validar seu SHA-256.
5. Restaurar esse fixture em PostgreSQL/Redis isolados, sem rede de envio,
   conferindo contagens/hashes e valores persistentes. Registrar evidências reais,
   nunca marcar concluído porque o arquivo existe ou porque o teste antigo passou.
6. Desmontar/descartar a área temporária conforme seu mecanismo de criptografia.
   `rm` não garante apagamento forense em SSD. Manter ambas as cópias cifradas.

Nenhuma senha ou identidade privada deve aparecer em screenshot, email ou relatório.
Um teste Docker no mesmo host comprova formato e funcionamento; não comprova
independência física. Perda de todas as cópias/senha pode tornar backups irrecuperáveis.

## Critério para encerrar esta pendência

Dois meios existentes, cópias cifradas verificadas, senha recuperável sem o Windows
original e ensaio documentado com identidade DEFINITIVA em equipamento independente.
Só então fornecer o destinatário público ao serviço de backup. Guardar identidades
anteriores enquanto existirem backups dependentes delas.

Fonte: [age oficial](https://github.com/FiloSottile/age).
