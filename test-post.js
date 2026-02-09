async function test() {
  try {
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'yan@admin.com', password: 'admin123' })
    });
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    
    // Test the test endpoint
    const testRes = await fetch('http://localhost:3001/api/styly/test-endpoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({})
    });
    
    console.log('Test POST status:', testRes.status);
    const text = await testRes.text();
    console.log('Response:', text.substring(0, 300));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
