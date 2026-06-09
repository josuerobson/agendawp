const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgresql://agendawp:149agendaxl9@localhost:5432/agendawp';
const pool = new Pool({ connectionString });

const cleanJsonString = (str) => {
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
};

async function run() {
  try {
    console.log('1. Connecting to database...');
    // Query configs
    const rows = await pool.query('SELECT * FROM Configuracoes');
    const configs = {};
    rows.rows.forEach(r => {
      configs[r.chave] = r.valor;
    });

    const apiKey = configs['gemini_api_key'];
    const model = configs['gemini_model'] || 'gemini-1.5-flash';
    const systemInstruction = configs['bot_system_instruction'] || 'Você é um assistente virtual.';
    const clinicaName = configs['nome_clinica'] || 'Agenda WP';

    console.log('2. Loaded configs:');
    console.log(`- gemini_api_key: ${apiKey ? '***' + apiKey.slice(-4) : '(empty)'}`);
    console.log(`- gemini_model: ${model}`);
    console.log(`- nome_clinica: ${clinicaName}`);
    console.log(`- prompt length: ${systemInstruction ? systemInstruction.length : 0} chars`);

    if (!apiKey) {
      console.log('❌ Error: gemini_api_key is empty in the database. Please enter it in the configurations page first!');
      return;
    }

    console.log('\n3. Building prompt...');
    const customPrompt = systemInstruction.replace(/{clinica}/g, clinicaName);
    const contextualInstruction = `${customPrompt}
    
---
CONTEXTO E DADOS DO SISTEMA:
1. Clinica: ${clinicaName}
2. Paciente Cadastrado: SIM
3. Nome: Paulo Josué Souza
4. Data/Hora: 2026-06-09 às 20:51:00

INSTRUÇÕES DO SCHEMA DE RESPOSTA JSON:
Retorne a resposta EXATAMENTE no formato JSON com as seguintes propriedades:
- "respostaTextBot": O texto em linguagem natural simpático e humanizado que será enviado ao paciente.
- "solicitaIntervencaoHumana": false
- "dadosExtraidos": { "nome": "Paulo Josué Souza" }
`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Tem estacionamento?' }]
        }
      ],
      systemInstruction: {
        parts: [{ text: contextualInstruction }]
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            respostaTextBot: { type: "STRING" },
            solicitaIntervencaoHumana: { type: "BOOLEAN" },
            dadosExtraidos: {
              type: "OBJECT",
              properties: {
                nome: { type: "STRING" },
                cpf: { type: "STRING" }
              }
            }
          },
          required: ["respostaTextBot", "solicitaIntervencaoHumana"]
        }
      }
    };

    console.log('4. Calling Gemini API...');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const start = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log(`- HTTP Status: ${res.status} (Time taken: ${Date.now() - start}ms)`);
    if (!res.ok) {
      const errText = await res.text();
      console.log('❌ Gemini API Error:', errText);
      return;
    }

    const data = await res.json();
    const botText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('- Raw Response from Gemini:', botText);

    if (botText) {
      const parsed = JSON.parse(cleanJsonString(botText));
      console.log('✅ Success! Parsed JSON Response:', parsed);
    }
  } catch (err) {
    console.error('❌ General Error:', err);
  } finally {
    await pool.end();
  }
}

run();
