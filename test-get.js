async function test() {
  try {
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'yan@admin.com', password: 'admin123' })
    });
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('✅ Got token\n');
    
    // Test GET /api/styly/tasks
    const getRes = await fetch('http://localhost:3001/api/styly/tasks', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('GET /api/styly/tasks status:', getRes.status);
    const text = await getRes.text();
    console.log('Response (first 300 chars):', text.substring(0, 300));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
