"use strict";

const OpenAIClient = require('./openaiClient');

(async () => {
    const client = new OpenAIClient({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.completeText('Di hola en español.');
    console.log('Respuesta:', response);
})().catch((error) => {
    console.error('OpenAI test failed:', error.message);
    process.exit(1);
});


