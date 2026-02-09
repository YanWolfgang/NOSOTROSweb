async function test() {
  try {
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'yan@admin.com', password: 'admin123' })
    });
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    
    // Test /api/nosotros endpoint (should exist)
    const testRes = await fetch('http://localhost:3001/api/nosotros/ideas', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Test GET /api/nosotros status:', testRes.status);
    const text = await testRes.text();
    console.log('Response (first 100 chars):', text.substring(0, 100));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
