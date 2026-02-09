async function verify() {
  try {
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'yan@admin.com', password: 'admin123' })
    });
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    
    // Get all tasks
    const tasksRes = await fetch('http://localhost:3001/api/styly/tasks', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const tasksData = await tasksRes.json();
    console.log(`✅ Total tasks imported: ${tasksData.tasks.length}`);
    console.log('\n📋 Tasks by project:');
    
    const byProject = {};
    tasksData.tasks.forEach(t => {
      const proj = t.proyecto || 'Sin proyecto';
      if (!byProject[proj]) byProject[proj] = [];
      byProject[proj].push(`  - [${t.task_id}] ${t.titulo}`);
    });
    
    Object.entries(byProject).forEach(([proj, tasks]) => {
      console.log(`\n${proj} (${tasks.length} tareas):`);
      tasks.forEach(t => console.log(t));
    });
    
    // Test AI context
    console.log('\n\n🤖 Testing AI context with STYLY data...');
    const aiRes = await fetch('http://localhost:3001/api/ai/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        question: 'Cuántas tareas tengo en STYLY? Dame un resumen por proyecto'
      })
    });
    
    const aiData = await aiRes.json();
    console.log('\nAI Response:');
    console.log(aiData.answer.substring(0, 500));
    
  } catch (e) {
    console.error('Error:', e.message);
  }
}

verify();
