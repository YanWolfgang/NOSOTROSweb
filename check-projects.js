async function test() {
  try {
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'yan@admin.com', password: 'admin123' })
    });
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    
    // Get projects
    const projectRes = await fetch('http://localhost:3001/api/styly/projects', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await projectRes.json();
    console.log('Projects:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
