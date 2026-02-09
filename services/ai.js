const GROQ_KEY = process.env.GROQ_API_KEY;

async function generate(prompt, system) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 8192,
      temperature: 0.5,        // Reduce randomness for consistent, structured output
      top_p: 0.9,             // Nucleus sampling for better quality
      frequency_penalty: 0.3   // Reduce repetition
    })
  });
  const d = await r.json();
  const text = d.choices?.[0]?.message?.content || '';
  if (!text) throw new Error(d.error?.message || 'Groq no devolvió texto');
  return text;
}

module.exports = { generate };
