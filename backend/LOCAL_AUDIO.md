# Transcrição local do piloto

O provedor padrão de áudio é local. Não existe fallback automático para a API de áudio paga. O texto resultante ainda usa o interpretador de IA configurado, que pode cobrar por tokens.

## Instalação

Criar um ambiente virtual com Python 3.9+ e instalar `pip install -r scripts/requirements-audio.txt`. Baixar uma vez o modelo público usando `WhisperModel('base', device='cpu', compute_type='int8', download_root='CAMINHO_DO_CACHE')`. Nenhum áudio é necessário para esse download.

No ambiente do worker de entrada, configurar:

```
AUDIO_TRANSCRIPTION_PROVIDER=local
LOCAL_WHISPER_PYTHON=CAMINHO_ABSOLUTO_DO_PYTHON_DO_AMBIENTE
LOCAL_WHISPER_CACHE=CAMINHO_ABSOLUTO_DO_CACHE
LOCAL_WHISPER_MODEL=base
WHATSAPP_AUDIO_ENABLED=true
WHATSAPP_AUDIO_ALLOWED_PHONES=TELEFONES_DO_PILOTO_SEPARADOS_POR_VIRGULA
```

O modelo base é multilíngue; não usar base.en para português. O script roda em CPU int8 com até quatro threads, decodifica até 90 segundos e recebe até 5 MB. Usa stdin/memória, não arquivos temporários de voz. O processo é encerrado após 45 segundos. A execução do modelo usa somente o cache local, com downloads e telemetria desativados; caminho ausente ou erro local não acionam serviço pago. Um subprocesso é criado a cada transcrição, com custo de carregar o modelo.

Somente mídia autenticada da Meta é baixada. O serviço externo continua necessário para receber o WhatsApp. Transcrições e referências mínimas ficam no banco; definir retenção e consentimento antes de ampliar o piloto.

## Publicação

Esta instalação habilita o computador local. O Dockerfile atual da API/worker não instala Python/modelo: para transcrever na Railway será preciso preparar um worker com runtime e cache próprios, medir CPU/memória e seu custo. Não copiar caminhos Windows para a Railway nem declarar áudio em nuvem disponível só porque a API está publicada.

Referência: https://github.com/SYSTRAN/faster-whisper
