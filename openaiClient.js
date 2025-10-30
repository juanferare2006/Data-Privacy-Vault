'use strict';

const axios = require('axios');

class OpenAIClient {
  constructor(options = {}) {
    const {
      apiKey = process.env.OPENAI_API_KEY,
      baseURL = 'https://api.openai.com/v1',
      model = process.env.OPENAI_MODEL || 'gpt-4o',
      timeoutMs = 30000,
    } = options;

    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('OPENAI_API_KEY is required. Provide it via .env or constructor options.');
    }

    this.apiKey = apiKey;
    this.model = model;
    this.http = axios.create({
      baseURL,
      timeout: timeoutMs,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async completeText(prompt, systemPrompt) {
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      throw new Error('Prompt must be a non-empty string');
    }

    const messages = [];
    if (systemPrompt && typeof systemPrompt === 'string') {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const body = {
      model: this.model,
      messages,
      temperature: 0.7,
    };

    const response = await this.http.post('/chat/completions', body);
    const reply = response.data.choices?.[0]?.message?.content;

    if (!reply) {
      throw new Error('No response from OpenAI');
    }

    return reply;
  }
}

module.exports = OpenAIClient;

