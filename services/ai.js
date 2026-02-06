const GROQ_KEY = process.env.GROQ_API_KEY;

async function generate(prompt, system) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 8192 })
  });
  const d = await r.json();
  const text = d.choices?.[0]?.message?.content || '';
  if (!text) throw new Error(d.error?.message || 'Groq no devolvió texto');
  return text;
}

module.exports = { generate };
