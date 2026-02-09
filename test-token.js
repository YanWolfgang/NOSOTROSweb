async function test() {
  try {
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'yan@admin.com', password: 'admin123' })
    });

    const loginData = await loginRes.json();
    console.log('Login status:', loginRes.status);
    console.log('Login data:', loginData);
    
    if (loginRes.ok && loginData.token) {
      const token = loginData.token;
      console.log('\n✅ Token obtained');
      
      // Try /api/ai/suggestions
      const sugRes = await fetch('http://localhost:3001/api/ai/suggestions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('Suggestions status:', sugRes.status);
      if (!sugRes.ok) {
        const err = await sugRes.json();
        console.log('Suggestions error:', err);
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
