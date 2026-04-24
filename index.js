require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Cache simples para evitar processar a mesma mensagem duas vezes
// (guarda IDs das últimas 100 mensagens processadas)
const processedMessages = new Set();

// Função para consultar o Ollama
async function queryOllama(prompt) {
    try {
        const response = await axios.post(`${process.env.OLLAMA_URL}/api/generate`, {
            model: process.env.OLLAMA_MODEL,
            prompt: prompt,
            stream: false
        });
        return response.data.response;
    } catch (error) {
        console.error('Erro ao consultar Ollama:', error.message);
        return 'Desculpe, tive um problema ao processar sua mensagem.';
    }
}

// Função para enviar mensagem ao WhatsApp
async function sendWhatsAppMessage(to, message) {
    try {
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: message }
            }
        });
        console.log('✅ Mensagem enviada com sucesso!');
        return response.data;
    } catch (error) {
        if (error.response?.data?.error?.code === 190) {
            console.error('❌ Token expirado! Gere um novo token no Meta for Developers');
        } else {
            console.error('❌ Erro ao enviar mensagem:', error.response?.data || error.message);
        }
    }
}

// Função que processa a mensagem de verdade (chamada em segundo plano)
async function processMessage(from, text, messageId) {
    console.log(`📨 Processando mensagem de ${from}: ${text}`);
    const resposta = await queryOllama(text);
    console.log(`🤖 Resposta: ${resposta}`);
    await sendWhatsAppMessage(from, resposta);
    // Remove do cache após processar (opcional)
    setTimeout(() => processedMessages.delete(messageId), 10000);
}

// Webhook de verificação (GET)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
        console.log('✅ Webhook verificado com sucesso!');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Falha na verificação do webhook');
        res.sendStatus(403);
    }
});

// Webhook para receber mensagens (POST) - AGORA COM RESPOSTA IMEDIATA
app.post('/webhook', (req, res) => {
    // Responder IMEDIATAMENTE ao WhatsApp (código 200)
    // Isso impede que o Meta reenvie a mensagem
    res.sendStatus(200);

    // Agora processamos o corpo da requisição em segundo plano
    try {
        const body = req.body;
        
        if (body.object === 'whatsapp_business_account' && body.entry) {
            const entry = body.entry[0];
            const changes = entry.changes[0];
            const value = changes.value;

            if (value.messages && value.messages[0]) {
                const message = value.messages[0];
                const from = message.from;
                const text = message.text?.body;
                const messageId = message.id; // ID único da mensagem

                if (!text) return;

                // Verifica se essa mensagem já foi processada (evita duplicatas)
                if (processedMessages.has(messageId)) {
                    console.log(`⏭️ Mensagem duplicada ignorada: ${messageId}`);
                    return;
                }

                // Adiciona ao cache de processadas
                processedMessages.add(messageId);
                // Limita o tamanho do cache para não vazar memória
                if (processedMessages.size > 100) {
                    const toDelete = [...processedMessages][0];
                    processedMessages.delete(toDelete);
                }

                // Processa a mensagem de forma assíncrona (não espera)
                processMessage(from, text, messageId);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao processar webhook (segundo plano):', error.message);
    }
});

// Rota de saúde
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date(),
        ollama: process.env.OLLAMA_URL,
        model: process.env.OLLAMA_MODEL
    });
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Bot rodando na porta ${PORT}`);
    console.log(`📱 Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
    console.log(`🤖 Modelo Ollama: ${process.env.OLLAMA_MODEL}`);
    console.log(`✨ Modo antiduplicata ativado`);
});