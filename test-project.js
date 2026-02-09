async function test() {
  try {
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'yan@admin.com', password: 'admin123' })
    });
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    
    // Try to create a project
    const projectRes = await fetch('http://localhost:3001/api/styly/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        nombre: 'Test Project',
        descripcion: 'Test description'
      })
    });
    
    console.log('Project creation status:', projectRes.status);
    const projectData = await projectRes.json();
    console.log('Project creation response:', JSON.stringify(projectData, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
