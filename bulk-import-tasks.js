require('dotenv').config();

// Proyectos a crear (API expects "name" and "description")
const projects = [
  { name: 'STYLY Panel', description: 'Software principal de gestión para negocios de belleza' },
  { name: 'Panel Afiliados', description: 'Sistema de comisiones y referrals' },
  { name: 'Landing Pages', description: 'Páginas de marketing y conversión' },
  { name: 'Subdominios', description: 'Infraestructura de subdominios dinámicos' },
  { name: 'Admin Panel', description: 'Panel administrativo central' }
];

// Tareas a importar (se usarán los IDs de proyectos creados)
const tasks = [
  // STYLY Panel
  { task_id: 'P-01', titulo: 'Diseño del panel principal', descripcion: 'Crear layout responsive del dashboard principal', proyectoNombre: 'STYLY Panel', seccion: 'Frontend', prioridad: 'Alta', fecha_vencimiento: '2026-02-24', asignados: ['Admin'] },
  { task_id: 'P-02', titulo: 'Autenticación con JWT', descripcion: 'Implementar login y validación de tokens', proyectoNombre: 'STYLY Panel', seccion: 'Backend', prioridad: 'Alta', fecha_vencimiento: '2026-02-24', asignados: ['Admin'] },
  { task_id: 'P-03', titulo: 'API de usuarios', descripcion: 'CRUD completo para gestión de usuarios', proyectoNombre: 'STYLY Panel', seccion: 'Backend', prioridad: 'Alta', fecha_vencimiento: '2026-03-10', asignados: ['Admin'] },
  { task_id: 'P-04', titulo: 'Integración de base de datos', descripcion: 'Conectar PostgreSQL y migrar esquema', proyectoNombre: 'STYLY Panel', seccion: 'Backend', prioridad: 'Alta', fecha_vencimiento: '2026-02-24', asignados: ['Admin'] },
  { task_id: 'P-05', titulo: 'Componentes reutilizables', descripcion: 'Crear librería de componentes UI', proyectoNombre: 'STYLY Panel', seccion: 'Frontend', prioridad: 'Media', fecha_vencimiento: '2026-03-10', asignados: ['Admin'] },

  // Panel Afiliados
  { task_id: 'A-01', titulo: 'Panel de comisiones', descripcion: 'Dashboard con cálculo automático de comisiones', proyectoNombre: 'Panel Afiliados', seccion: 'Frontend', prioridad: 'Alta', fecha_vencimiento: '2026-02-24', asignados: ['Admin'] },
  { task_id: 'A-02', titulo: 'Reportes de afiliados', descripcion: 'Generar reportes PDF/Excel de ventas', proyectoNombre: 'Panel Afiliados', seccion: 'Backend', prioridad: 'Media', fecha_vencimiento: '2026-03-10', asignados: ['Admin'] },
  { task_id: 'A-03', titulo: 'Sistema de invitaciones', descripcion: 'Referral links y tracking de nuevos afiliados', proyectoNombre: 'Panel Afiliados', seccion: 'Backend', prioridad: 'Media', fecha_vencimiento: '2026-03-10', asignados: ['Admin'] },

  // Landing Pages
  { task_id: 'L-01', titulo: 'Landing page principal', descripcion: 'Página de inicio responsiva con conversión', proyectoNombre: 'Landing Pages', seccion: 'Frontend', prioridad: 'Alta', fecha_vencimiento: '2026-02-24', asignados: ['Admin'] },
  { task_id: 'L-02', titulo: 'Página de precios', descripcion: 'Mostrar planes y comparativas', proyectoNombre: 'Landing Pages', seccion: 'Frontend', prioridad: 'Media', fecha_vencimiento: '2026-03-10', asignados: ['Admin'] },

  // Subdominios
  { task_id: 'S-01', titulo: 'Infraestructura de subdominios', descripcion: 'Configurar DNS y wildcard', proyectoNombre: 'Subdominios', seccion: 'DevOps', prioridad: 'Alta', fecha_vencimiento: '2026-02-24', asignados: ['Admin'] },
  { task_id: 'S-02', titulo: 'Panel de control de subdominios', descripcion: 'Crear/eliminar subdominios dinámicamente', proyectoNombre: 'Subdominios', seccion: 'Backend', prioridad: 'Media', fecha_vencimiento: '2026-03-10', asignados: ['Admin'] },

  // Admin Panel
  { task_id: 'AD-01', titulo: 'Dashboard administrativo', descripcion: 'Panel para gestión general del sistema', proyectoNombre: 'Admin Panel', seccion: 'Frontend', prioridad: 'Alta', fecha_vencimiento: '2026-02-24', asignados: ['Admin'] },
  { task_id: 'AD-02', titulo: 'Gestión de usuarios', descripcion: 'Admin CRUD de usuarios y permisos', proyectoNombre: 'Admin Panel', seccion: 'Backend', prioridad: 'Media', fecha_vencimiento: '2026-03-10', asignados: ['Admin'] },
  { task_id: 'AD-03', titulo: 'Logs y auditoría', descripcion: 'Sistema de logging de acciones del admin', proyectoNombre: 'Admin Panel', seccion: 'Backend', prioridad: 'Baja', fecha_vencimiento: '2026-04-10', asignados: ['Admin'] }
];

async function importTasks() {
  try {
    // Get credentials from args or env
    const email = process.argv[2] || process.env.USER_EMAIL || 'admin@example.com';
    const password = process.argv[3] || process.env.USER_PASSWORD || 'admin123';

    // 1. Login to get token
    console.log('🔐 Obteniendo token de autenticación...');
    console.log(`📧 Email: ${email}`);
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const loginData = await loginRes.json();
    if (!loginRes.ok) {
      console.error('❌ Error de login:', loginData.error);
      console.log('💡 Verifica las credenciales o crea un usuario admin');
      process.exit(1);
    }

    const token = loginData.token;
    console.log('✅ Token obtenido\n');

    // 2. Get existing projects
    console.log('📂 Obteniendo proyectos existentes...');
    const proyectosRes = await fetch('http://localhost:3001/api/styly/projects', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const proyectosData = await proyectosRes.json();
    const proyectoMap = {};

    if (proyectosData.projects && Array.isArray(proyectosData.projects)) {
      proyectosData.projects.forEach(p => {
        proyectoMap[p.name || p.nombre] = p.id;
      });
    }

    // 3. Create missing projects
    console.log(`📂 Creando ${projects.length - Object.keys(proyectoMap).length} proyectos nuevos...`);
    for (const proyecto of projects) {
      if (!proyectoMap[proyecto.name]) {
        const projectRes = await fetch('http://localhost:3001/api/styly/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(proyecto)
        });

        const projectData = await projectRes.json();
        if (projectRes.ok && projectData.project && projectData.project.id) {
          proyectoMap[proyecto.name] = projectData.project.id;
          console.log(`  ✅ ${proyecto.name} (ID: ${projectData.project.id})`);
        } else if (projectRes.ok && projectData.id) {
          proyectoMap[proyecto.name] = projectData.id;
          console.log(`  ✅ ${proyecto.name} (ID: ${projectData.id})`);
        } else {
          console.log(`  ⚠️  ${proyecto.name} (error: ${projectData.error || 'desconocido'})`);
        }
      } else {
        console.log(`  ✓ ${proyecto.name} (ID: ${proyectoMap[proyecto.name]})`);
      }
    }
    console.log('');

    // 4. Create tasks with proyecto_id mapping
    console.log(`📦 Importando ${tasks.length} tareas...`);
    const tasksWithIds = tasks.map(task => ({
      ...task,
      proyecto_id: proyectoMap[task.proyectoNombre] || 1
    }));

    const response = await fetch('http://localhost:3001/api/styly/tasks/bulk-create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ tasks: tasksWithIds })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error:', data.error);
      process.exit(1);
    }

    console.log('✅ Tareas importadas correctamente!');
    console.log(`✨ Creadas: ${data.created}/${data.total_attempted}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en la importación:', error.message);
    process.exit(1);
  }
}

importTasks();
