async function test() {
  try {
    // Get token
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'yan@admin.com', password: 'admin123' })
    });
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('✅ Got token\n');
    
    // Test bulk create
    const bulkRes = await fetch('http://localhost:3001/api/styly/tasks/bulk-create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        tasks: [
          { task_id: 'TEST-001', titulo: 'Test Task', proyecto_id: 1 }
        ]
      })
    });
    
    console.log('Status:', bulkRes.status);
    const text = await bulkRes.text();
    console.log('Response text (first 500 chars):', text.substring(0, 500));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
