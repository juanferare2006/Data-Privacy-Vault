# Data Privacy Vault

Servicio Node.js para anonimizar y proteger información personal (PII) antes de enviarla a modelos de IA, y restaurarla al volver. Incluye un proxy seguro para ChatGPT que anonimiza el prompt, consulta a OpenAI y deanonimiza la respuesta automáticamente.

## Features

- **Email anonymization**: Detecta y reemplaza correos con tokens prefijados
- **Phone anonymization**: Detecta y reemplaza teléfonos con tokens prefijados  
- **Name anonymization**: Detecta y reemplaza nombres con tokens prefijados
- **Deanonymization**: Restaura PII original a partir de tokens
- **Secure ChatGPT proxy**: `POST /secureChatGPT` anonimiza → llama OpenAI → deanonimiza
- **MongoDB Atlas**: Persiste los mapeos token ↔ valor original para reversión confiable
- **RESTful API**: Endpoints POST para anonimizar y desanonimizar, health checks
- **Security**: Headers seguros con Helmet; validación y manejo de errores
- **Logging**: Trazabilidad con Morgan

## Installation

1. Clona o descarga este repo
2. Abre una terminal en la carpeta del proyecto:
   ```bash
   cd "./data-privacy-vault"
   ```
3. Instala dependencias:
   ```bash
   npm install
   ```
4. Crea un archivo `.env` con tu API key de OpenAI:
   ```
   OPENAI_API_KEY=sk-tu-api-key-aqui
   OPENAI_MODEL=gpt-4o-mini
   PORT=3001
   ```
   - Alternativamente, puedes exportar la variable en la misma terminal: `export OPENAI_API_KEY=...`

## Usage

### Start the server

Development mode (auto-restart):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

El servidor inicia en el puerto 3001 por defecto (configurable vía `PORT`).

Verifica salud:
```bash
curl http://localhost:3001/health
```

### API Endpoints

#### POST /anonymize

Anonymizes PII in a text message.

**Request:**
```bash
curl -X POST http://localhost:3001/anonymize \
  -H "Content-Type: application/json" \
  -d '{"message":"oferta de trabajo para Dago Borda con email dborda@gmail.com y teléfono 3152319157"}'
```

**Response:**
```json
{
  "anonymizedMessage": "oferta de trabajo para NAME_87fariah con email EMAIL_ygkfqkay y teléfono PHONE_zgasvx4c"
}
```

#### POST /deanonymize

Deanonymizes PII tokens back to original values.

**Request:**
```bash
curl -X POST http://localhost:3001/deanonymize \
  -H "Content-Type: application/json" \
  -d '{"anonymizedMessage":"oferta de trabajo para NAME_87fariah con email EMAIL_ygkfqkay y teléfono PHONE_zgasvx4c"}'
```

**Response:**
```json
{
  "message": "oferta de trabajo para Dago Borda con email dborda@gmail.com y teléfono 3152319157"
}
```

#### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-10-28T20:10:00.000Z",
  "service": "Data Privacy Vault"
}
```

#### POST /secureChatGPT

Proxy seguro que anonimiza el prompt, llama a OpenAI y deanonimiza la respuesta.

**Request:**
```bash
curl -X POST http://localhost:3001/secureChatGPT \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Escribe un correo para Dago Borda (dborda@gmail.com) agradeciendo su interés en la vacante."}'
```

**Response (ejemplo):**
```json
{
  "response": "Asunto: Agradecimiento por tu interés en la vacante..."
}
```

#### GET /

API information endpoint.

## PII Detection Patterns

The service detects the following types of PII:

1. **Email addresses**: Standard email format (user@domain.com) → `EMAIL_` prefix
2. **Phone numbers**: Colombian phone number format (3XX XXX XXXX) → `PHONE_` prefix
3. **Names**: Capitalized words that could be names (simple heuristic) → `NAME_` prefix

## Token Format

All anonymized PII is replaced with prefixed tokens in the format:
- `NAME_[8-character-token]` para nombres
- `EMAIL_[8-character-token]` para correos  
- `PHONE_[8-character-token]` para teléfonos

Los tokens y sus valores originales se almacenan en **MongoDB Atlas** para permitir la recuperación exacta durante la desanonimización.

## Security Considerations

- The service uses Helmet for security headers
- Input validation prevents injection attacks
- Error messages don't expose sensitive information
- CORS is enabled for cross-origin requests

## Development

Stack:
- **Express.js**: Web framework
- **Helmet**: Security middleware
- **Morgan**: HTTP request logger
- **CORS**: Cross-origin resource sharing
- **Mongoose**: ODM para MongoDB Atlas
- **Axios**: Cliente HTTP para OpenAI
- **Nodemon**: Auto-restart en desarrollo

### Probar OpenAI sin arrancar el servidor
```bash
node test-openai.js
```

Si ves un error tipo "OPENAI_API_KEY is required", asegúrate de tener la variable en `.env` o exportada en la terminal.

## Troubleshooting

- **`npm start` lanza ENOENT (no encuentra package.json)**  
  Asegúrate de estar en la carpeta correcta:
  ```bash
  cd "./data-privacy-vault"
  npm start
  ```

- **`OPENAI_API_KEY is required`**  
  Configura tu API key en `.env` o expórtala en la misma terminal donde arrancas el servidor:
  ```bash
  export OPENAI_API_KEY=sk-tu-api-key-aqui
  npm start
  ```

- **El puerto 3001 no responde**  
  Verifica salud y logs:
  ```bash
  curl http://localhost:3001/health
  ```
  Si el server no inicia, ejecuta en primer plano para ver errores:
  ```bash
  node server.js
  ```

- **Múltiples servidores corriendo**  
  Cierra instancias previas:
  ```bash
  pkill -f "node server.js"
  ```

## License

ISC
