require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const crypto = require('crypto');
const mongoose = require('mongoose');
const OpenAIClient = require('./openaiClient');

const app = express();
const PORT = process.env.PORT || 3001;

// MongoDB connection string
const MONGODB_URI = "mongodb+srv://admin:Camara0424*@cluster0.xnythwl.mongodb.net/?appName=Cluster0";

// Mongoose schema for PII mappings
const piiMappingSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    originalValue: {
        type: String,
        required: true
    },
    piiType: {
        type: String,
        required: true,
        enum: ['NAME', 'EMAIL', 'PHONE']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create the model
const PIIMapping = mongoose.model('PIIMapping', piiMappingSchema);

// Connect to MongoDB Atlas
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ Connected to MongoDB Atlas');
})
.catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
});

// Middleware setup
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('combined')); // Logging
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

/**
 * Generates a random alphanumeric token of specified length
 * @param {number} length - Length of the token to generate
 * @returns {string} Random alphanumeric token
 */
function generateToken(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
}

/**
 * Wrap token to make it resilient to LLM rewrites
 */
function wrapToken(token) {
    return `{{${token}}}`; // e.g., {{NAME_ab12cd34}}
}

/**
 * Generates a prefixed token and stores the mapping in MongoDB
 * @param {string} originalPII - The original PII value
 * @param {string} prefix - The prefix for the token (NAME_, EMAIL_, PHONE_)
 * @returns {Promise<string>} Wrapped prefixed token
 */
async function generatePrefixedToken(originalPII, prefix) {
    const token = generateToken(8);
    const prefixedToken = `${prefix}${token}`; // NAME_ab12cd34
    const wrappedToken = wrapToken(prefixedToken); // {{NAME_ab12cd34}}
    
    // Extract PII type from prefix
    const piiType = prefix.replace('_', '');
    
    try {
        // Store the mapping in MongoDB
        const mapping = new PIIMapping({
            token: wrappedToken, // store wrapped form
            originalValue: originalPII,
            piiType: piiType
        });
        
        await mapping.save();
        console.log(`✅ Saved PII mapping: ${wrappedToken} -> ${originalPII}`);
        
    } catch (error) {
        console.error('❌ Error saving PII mapping to MongoDB:', error);
        throw new Error('Failed to save PII mapping');
    }
    
    return wrappedToken;
}

/**
 * Detects and extracts PII patterns from text
 * @param {string} text - Input text to analyze
 * @returns {Object} Object containing detected PII patterns
 */
function detectPII(text) {
    const patterns = {
        // Email pattern - matches email addresses
        email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        
        // Phone pattern - matches various phone number formats
        phone: /\b(?:\+?57\s?)?(?:3[0-9]{2}|6[0-9]{2}|7[0-9]{2}|8[0-9]{2}|9[0-9]{2})\s?[0-9]{3}\s?[0-9]{4}\b/g,
        
        // Name pattern - matches capitalized words that could be names
        // This is a simple heuristic - in production, you'd want more sophisticated NLP
        name: /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*\b/g
    };
    
    const detected = {};
    
    for (const [type, pattern] of Object.entries(patterns)) {
        const matches = text.match(pattern);
        if (matches) {
            detected[type] = matches;
        }
    }
    
    return detected;
}

/**
 * Anonymizes PII in the given text by replacing with prefixed tokens
 * @param {string} message - The message containing PII
 * @returns {Promise<string>} Anonymized message
 */
async function anonymizeMessage(message) {
    if (!message || typeof message !== 'string') {
        throw new Error('Message must be a non-empty string');
    }
    
    let anonymizedText = message;
    const detectedPII = detectPII(message);
    
    // Replace emails with prefixed tokens
    if (detectedPII.email) {
        for (const email of detectedPII.email) {
            const token = await generatePrefixedToken(email, 'EMAIL_');
            anonymizedText = anonymizedText.replace(email, token);
        }
    }
    
    // Replace phone numbers with prefixed tokens
    if (detectedPII.phone) {
        for (const phone of detectedPII.phone) {
            const token = await generatePrefixedToken(phone, 'PHONE_');
            anonymizedText = anonymizedText.replace(phone, token);
        }
    }
    
    // Replace names with prefixed tokens
    if (detectedPII.name) {
        for (const name of detectedPII.name) {
            const token = await generatePrefixedToken(name, 'NAME_');
            anonymizedText = anonymizedText.replace(name, token);
        }
    }
    
    return anonymizedText;
}

/**
 * POST /anonymize endpoint
 * Receives a message with PII and returns anonymized version
 */
app.post('/anonymize', async (req, res) => {
    try {
        // Validate request body
        if (!req.body || !req.body.message) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Request body must contain a "message" field'
            });
        }
        
        const { message } = req.body;
        
        // Validate message type
        if (typeof message !== 'string') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Message must be a string'
            });
        }
        
        // Validate message length
        if (message.length === 0) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Message cannot be empty'
            });
        }
        
        // Anonymize the message
        const anonymizedMessage = await anonymizeMessage(message);
        
        // Return the anonymized message
        res.json({
            anonymizedMessage: anonymizedMessage
        });
        
    } catch (error) {
        console.error('Error in /anonymize endpoint:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while processing the request'
        });
    }
});

/**
 * Deanonymizes PII tokens back to original values using MongoDB
 * @param {string} anonymizedMessage - The message with prefixed tokens
 * @returns {Promise<string>} Original message with PII restored
 */
async function deanonymizeMessage(anonymizedMessage) {
    if (!anonymizedMessage || typeof anonymizedMessage !== 'string') {
        throw new Error('Anonymized message must be a non-empty string');
    }
    
    let originalText = anonymizedMessage;
    
    // Match wrapped tokens like {{NAME_abcdefgh}} or legacy unwrapped NAME_abcdefgh
    const tokenPattern = /\{\{(NAME_|EMAIL_|PHONE_)[a-z0-9]{8,}\}\}|(NAME_|EMAIL_|PHONE_)[a-z0-9]{8,}/g;
    const tokens = anonymizedMessage.match(tokenPattern);
    
    if (tokens) {
        for (const token of tokens) {
            try {
                // Prefer wrapped token lookup
                const wrapped = token.startsWith('{{') ? token : wrapToken(token);
                let mapping = await PIIMapping.findOne({ token: wrapped });
                
                if (!mapping) {
                    // Fallback: legacy unwrapped storage (if any)
                    mapping = await PIIMapping.findOne({ token });
                }

                if (mapping) {
                    const toReplace = token.startsWith('{{') ? token : wrapped;
                    const escaped = toReplace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    originalText = originalText.replace(new RegExp(escaped, 'g'), mapping.originalValue);
                    console.log(`✅ Restored PII mapping: ${toReplace} -> ${mapping.originalValue}`);
                } else {
                    console.warn(`⚠️ Token not found in MongoDB: ${token}`);
                }
            } catch (error) {
                console.error(`❌ Error retrieving mapping for token ${token}:`, error);
            }
        }
    }
    
    return originalText;
}

/**
 * POST /deanonymize endpoint
 * Receives an anonymized message and returns the original message
 */
app.post('/deanonymize', async (req, res) => {
    try {
        // Validate request body
        if (!req.body || !req.body.anonymizedMessage) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Request body must contain an "anonymizedMessage" field'
            });
        }
        
        const { anonymizedMessage } = req.body;
        
        // Validate message type
        if (typeof anonymizedMessage !== 'string') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Anonymized message must be a string'
            });
        }
        
        // Validate message length
        if (anonymizedMessage.length === 0) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Anonymized message cannot be empty'
            });
        }
        
        // Deanonymize the message
        const originalMessage = await deanonymizeMessage(anonymizedMessage);
        
        // Return the original message
        res.json({
            message: originalMessage
        });
        
    } catch (error) {
        console.error('Error in /deanonymize endpoint:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while processing the request'
        });
    }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Data Privacy Vault'
    });
});

/**
 * Root endpoint with API information
 */
app.get('/', (req, res) => {
    res.json({
        service: 'Data Privacy Vault',
        version: '1.0.0',
        description: 'API for anonymizing PII data',
        endpoints: {
            'POST /anonymize': 'Anonymize PII in messages',
            'POST /deanonymize': 'Deanonymize messages back to original PII',
            'POST /secureChatGPT': 'PII-safe ChatGPT proxy with anonymize/deanonymize',
            'GET /health': 'Health check endpoint'
        }
    });
});

/**
 * POST /secureChatGPT
 * Receives { prompt }, anonymizes it, sends to ChatGPT, deanonymizes the reply
 */
app.post('/secureChatGPT', async (req, res) => {
    try {
        if (!req.body || typeof req.body.prompt !== 'string') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Request body must contain a string field "prompt"'
            });
        }

        const originalPrompt = req.body.prompt;
        if (originalPrompt.length === 0) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Prompt cannot be empty'
            });
        }

        // 1) Anonymize incoming prompt
        const anonymizedPrompt = await anonymizeMessage(originalPrompt);

        // 2) Call OpenAI with anonymized prompt and strict token preservation
        const openai = new OpenAIClient({ apiKey: process.env.OPENAI_API_KEY });
        const systemPrompt = 'Eres un asistente que NUNCA modifica ni reescribe tokens con formato {{NAME_********}}, {{EMAIL_********}} o {{PHONE_********}}. Mantén esos tokens exactamente iguales en tu respuesta; no agregues ni quites caracteres dentro de las llaves. Responde normalmente el resto.';
        const aiResponse = await openai.completeText(anonymizedPrompt, systemPrompt);

        // 3) Deanonymize AI response
        const finalResponse = await deanonymizeMessage(aiResponse);

        return res.json({ response: finalResponse });
    } catch (error) {
        console.error('Error in /secureChatGPT endpoint:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while processing the request'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist'
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Data Privacy Vault server running on port ${PORT}`);
    console.log(`📊 Health check available at: http://localhost:${PORT}/health`);
    console.log(`🔒 Anonymize endpoint: http://localhost:${PORT}/anonymize`);
});

module.exports = app;
