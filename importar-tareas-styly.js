/**
 * Script para importar las 65 tareas del plan de desarrollo a STYLY
 * Ejecutar: node importar-tareas-styly.js
 */

const { pool } = require('./db/database');

// Configuración
const ADMIN_USER_ID = 1; // ID del usuario admin (yan@admin.com)
const START_DATE = new Date('2026-02-10'); // Fecha de inicio general

// Usuarios del equipo
const USERS = {
  DAMIAN: { name: 'Damián', email: 'damian@styly.mx' },
  EMILIO: { name: 'Emilio', email: 'emilio@styly.mx' }
};

// Proyectos a crear
const PROJECTS = [
  {
    nombre: '🏢 STYLY Panel',
    descripcion: 'Panel de negocios principal - Dashboard, mensajes, pagos, tareas, facturación',
    color: '#8b5cf6',
    emoji: '🏢'
  },
  {
    nombre: '👥 Panel Afiliados',
    descripcion: 'Panel para afiliados elite - Puntaje, comisiones, Academy, consultoría',
    color: '#10b981',
    emoji: '👥'
  },
  {
    nombre: '🌐 Landing Pages',
    descripcion: 'Landing principal y página de afiliados - Hero, demos, chatbot',
    color: '#f59e0b',
    emoji: '🌐'
  },
  {
    nombre: '🏪 Subdominios Web',
    descripcion: 'Tiendas web de clientes - Registro, reservas, facturación',
    color: '#3b82f6',
    emoji: '🏪'
  },
  {
    nombre: '⚙️ Admin Panel',
    descripcion: 'Panel administrativo interno - Dashboard, pagos, negocios, soporte',
    color: '#ef4444',
    emoji: '⚙️'
  }
];

// Todas las tareas organizadas por bloque
const TASKS = {
  'STYLY Panel': [
    { id: 'P-01', titulo: 'Banner notificaciones carrusel', descripcion: 'Reemplazar banner de bienvenida por ventana de notificaciones tipo carrusel (dismissable). Primera notificación: "Bienvenido de vuelta"', prioridad: 'Alta', asignado: 'Emilio', modulo: 'Dashboard' },
    { id: 'P-02', titulo: 'Insights del negocio', descripcion: 'Agregar insights: clientes ganados/perdidos vs mes anterior, suscripciones nuevas/perdidas, ingresos por suscripciones, citas del mes', prioridad: 'Alta', asignado: 'Emilio', modulo: 'Dashboard' },
    { id: 'P-03', titulo: 'Descargar reporte dashboard', descripcion: 'Botón para descargar reporte del dashboard en Excel y PDF', prioridad: 'Media', asignado: 'Emilio', modulo: 'Dashboard' },
    { id: 'P-04', titulo: 'Mails masivos + templates', descripcion: 'Módulo de envío de mails masivos (promociones). Incluir 2 templates HTML personalizables (color, imágenes, texto)', prioridad: 'Alta', asignado: 'Damián', modulo: 'Mensajes' },
    { id: 'P-05', titulo: 'Conectar email del dueño', descripcion: 'Conectar email del dueño o email configurado para envío de mensajes desde el módulo', prioridad: 'Alta', asignado: 'Damián', modulo: 'Mensajes' },
    { id: 'P-06', titulo: 'Pago manual sin servicio', descripcion: 'Permitir registrar un pago manual aunque no exista el servicio asociado (pago libre)', prioridad: 'Media', asignado: 'Damián', modulo: 'Pagos' },
    { id: 'P-07', titulo: 'Filtro pagos por fechas', descripcion: 'Filtrar pagos por rango de fechas personalizado y descargar reporte en PDF, CSV o Excel', prioridad: 'Media', asignado: 'Damián', modulo: 'Pagos' },
    { id: 'P-08', titulo: 'Panel admin facturas', descripcion: 'Panel para administrar facturas generadas anteriormente', prioridad: 'Media', asignado: 'Damián', modulo: 'Pagos' },
    { id: 'P-09', titulo: 'Notificaciones eventos', descripcion: 'Notificaciones al usuario en StylyPanel cada que hay un nuevo evento', prioridad: 'Alta', asignado: 'Damián', modulo: 'Tareas' },
    { id: 'P-10', titulo: 'CRUD columnas tablero', descripcion: 'Permitir agregar, renombrar y eliminar columnas en el tablero de tareas', prioridad: 'Media', asignado: 'Damián', modulo: 'Tareas' },
    { id: 'P-11', titulo: 'Drag & drop móvil', descripcion: 'En móvil: drag & drop intuitivo para mover tareas entre columnas', prioridad: 'Media', asignado: 'Damián', modulo: 'Tareas' },
    { id: 'P-12', titulo: 'Renombrar a Tickets', descripcion: 'Renombrar módulo "Soporte" a "Tickets"', prioridad: 'Baja', asignado: 'Damián', modulo: 'Tickets' },
    { id: 'P-13', titulo: 'Auto-envío tickets', descripcion: 'Auto-envío de mensajes de atención al cliente con notificación push al usuario', prioridad: 'Alta', asignado: 'Damián', modulo: 'Tickets' },
    { id: 'P-14', titulo: 'Revisar descargar datos', descripcion: 'Revisar funcionalidad de "Descargar datos" — verificar qué datos descarga y que funcione', prioridad: 'Baja', asignado: 'Emilio', modulo: 'Cuenta' },
    { id: 'P-15', titulo: 'Verificar email soporte', descripcion: 'Verificar que el email de soporte (soporte@styly.mx) reciba mensajes de prueba', prioridad: 'Baja', asignado: 'Emilio', modulo: 'Cuenta' },
    { id: 'P-16', titulo: 'Auth 2 pasos', descripcion: 'Configurar autenticación de dos pasos con todos los métodos disponibles', prioridad: 'Alta', asignado: 'Emilio', modulo: 'Cuenta' },
    { id: 'P-17', titulo: 'Términos y condiciones', descripcion: 'Agregar términos y condiciones de Styly en el formulario de registro (Google y normal)', prioridad: 'Alta', asignado: 'Damián', modulo: 'Registro' },
    { id: 'P-18', titulo: 'Dropdown móvil Métricas+', descripcion: 'Dropdown menu en móvil para todas las secciones Plus y selección de datos de gráfica', prioridad: 'Media', asignado: 'Emilio', modulo: 'Métricas+' },
    { id: 'P-19', titulo: 'Herramienta IA lateral', descripcion: 'Herramienta de IA en barra lateral para consultas sobre el negocio. Descargar consultas. Disclaimer: chat se borra en 7 días pero se puede descargar', prioridad: 'Media', asignado: 'Emilio', modulo: 'IA' },
    { id: 'P-20', titulo: 'Panel facturación SAT', descripcion: 'Crear panel de facturación para negocios: generar factura fiscal que timbre al SAT. Integración con Facturapi o Gigstack', prioridad: 'Alta', asignado: 'Damián', modulo: 'Facturación' },
    { id: 'P-21', titulo: 'Onboarding Stripe integrado', descripcion: 'Quitar onboarding de Stripe externo; reemplazar por onboarding integrado dentro del panel', prioridad: 'Alta', asignado: 'Damián', modulo: 'Stripe' },
    { id: 'P-22', titulo: 'QA General Panel', descripcion: 'Revisión completa de conectividad y funcionamiento: filtros, diseños, métricas plus, flujos completos', prioridad: 'Alta', asignado: 'Ambos', modulo: 'QA' }
  ],
  'Panel Afiliados': [
    { id: 'A-01', titulo: 'Sistema puntaje real', descripcion: 'Que funcione el sistema de puntaje real (puntos reales, no demo)', prioridad: 'Alta', asignado: 'Emilio', modulo: 'Puntaje' },
    { id: 'A-02', titulo: 'Sección crucero', descripcion: 'Agregar sección del crucero en el tablero de puntaje', prioridad: 'Media', asignado: 'Emilio', modulo: 'Puntaje' },
    { id: 'A-03', titulo: 'Widget comisiones', descripcion: 'Widget de tasa de comisiones: componente con todas las comisiones desglosadas y paginadas', prioridad: 'Media', asignado: 'Emilio', modulo: 'Comisiones' },
    { id: 'A-04', titulo: '50% primera venta', descripcion: 'Aplicar 50% en primera venta + mensaje en Academy notificando esto al terminar curso y certificado', prioridad: 'Alta', asignado: 'Emilio', modulo: 'Comisiones' },
    { id: 'A-05', titulo: 'Descargar historial pagos', descripcion: 'Poder descargar historial de pagos completo', prioridad: 'Media', asignado: 'Emilio', modulo: 'Pagos' },
    { id: 'A-06', titulo: 'Verificar export referidos', descripcion: 'Verificar que se exporten los datos de referidos correctamente', prioridad: 'Media', asignado: 'Emilio', modulo: 'Referidos' },
    { id: 'A-07', titulo: 'Descargar reporte referidos', descripcion: 'Botón de descargar reporte en PDF y Excel', prioridad: 'Media', asignado: 'Emilio', modulo: 'Referidos' },
    { id: 'A-08', titulo: 'Módulos 3 y 4 Academy', descripcion: 'Agregar módulos 3 y 4 a Academy', prioridad: 'Alta', asignado: 'Damián', modulo: 'Academy' },
    { id: 'A-09', titulo: 'Unificar 5 módulos curso', descripcion: 'Meter los primeros 5 módulos como un solo curso con el nombre del certificado', prioridad: 'Media', asignado: 'Damián', modulo: 'Academy' },
    { id: 'A-10', titulo: 'Cambiar duración módulos', descripcion: 'Cambiar duración de módulos de la academy', prioridad: 'Baja', asignado: 'Damián', modulo: 'Academy' },
    { id: 'A-11', titulo: 'Certificado al terminar', descripcion: 'Al terminar la academy, mostrar certificado al usuario', prioridad: 'Alta', asignado: 'Damián', modulo: 'Academy' },
    { id: 'A-12', titulo: 'Módulo consultoría + survey', descripcion: 'Crear módulo "Consultoría" en menú lateral. Survey/cuestionario para recabar info del negocio: nombre, número, contacto, giro. Cada pregunta ligada a una extensión de Styly', prioridad: 'Alta', asignado: 'Emilio', modulo: 'Consultoría' },
    { id: 'A-13', titulo: 'Sugerencias + análisis', descripcion: 'La herramienta sugiere extensiones/paquetes basado en respuestas. Generar análisis descargable con link de afiliado (que se deseche después de uso)', prioridad: 'Alta', asignado: 'Emilio', modulo: 'Consultoría' },
    { id: 'A-14', titulo: 'Premios mensuales admin', descripcion: 'Agregar premios mensuales administrables en clasificación global (arriba junto con crucero)', prioridad: 'Media', asignado: 'Emilio', modulo: 'Clasificación' },
    { id: 'A-15', titulo: 'Banner crucero', descripcion: 'Banner del crucero Styly en la clasificación global', prioridad: 'Baja', asignado: 'Emilio', modulo: 'Clasificación' },
    { id: 'A-16', titulo: 'Sync columnas tareas', descripcion: 'Reflejar mismos ajustes que Panel Styly: agregar/quitar/renombrar columnas', prioridad: 'Media', asignado: 'Damián', modulo: 'Tareas' },
    { id: 'A-17', titulo: 'Textos invitación redes', descripcion: 'Cambiar los textos de invitación de las redes sociales en "Mi Enlace"', prioridad: 'Baja', asignado: 'Emilio', modulo: 'Enlace' },
    { id: 'A-18', titulo: 'Kit de afiliado', descripcion: 'Implementar el kit de afiliado completo', prioridad: 'Media', asignado: 'Emilio', modulo: 'Kit' },
    { id: 'A-19', titulo: 'Add-ons sin bloqueos demo', descripcion: 'En modo demo de Styly Panel, mostrar los add-ons sin bloqueos', prioridad: 'Baja', asignado: 'Emilio', modulo: 'Demo' },
    { id: 'A-20', titulo: 'Ajustar msg bienvenida', descripcion: 'Ajustar mensaje de bienvenida del panel de afiliados', prioridad: 'Baja', asignado: 'Emilio', modulo: 'UI' },
    { id: 'A-21', titulo: 'Renombrar Tickets→Soporte', descripcion: 'Cambiar nombre de "Tickets" a "Soporte" (en panel afiliados es al revés que en panel negocio)', prioridad: 'Baja', asignado: 'Emilio', modulo: 'UI' },
    { id: 'A-22', titulo: 'Botón afiliado cuenta exist', descripcion: 'Que funcione botón "Quiero ser afiliado" con cuenta ya registrada', prioridad: 'Alta', asignado: 'Damián', modulo: 'Registro' },
    { id: 'A-23', titulo: 'Botón dejar afiliado', descripcion: 'Agregar botón de "Dejar de ser afiliado" en panel de afiliado', prioridad: 'Baja', asignado: 'Damián', modulo: 'Registro' }
  ],
  'Landing Pages': [
    { id: 'L-01', titulo: 'Vista previa add-ons', descripcion: 'Agregar vista previa de los add-ons al abrir detalles: preview de cada herramienta con más info', prioridad: 'Media', asignado: 'Emilio', modulo: 'Landing' },
    { id: 'L-02', titulo: 'Demo interactiva panel', descripcion: 'Agregar demo interactiva del panel para visitantes', prioridad: 'Media', asignado: 'Emilio', modulo: 'Landing' },
    { id: 'L-03', titulo: 'Chatbot FAQ', descripcion: 'Chatbot de preguntas y respuestas predeterminadas', prioridad: 'Media', asignado: 'Emilio', modulo: 'Landing' },
    { id: 'L-04', titulo: 'Imagen hero section', descripcion: 'Cambiar animación del hero section por imagen real del panel de Styly', prioridad: 'Baja', asignado: 'Emilio', modulo: 'Landing' },
    { id: 'L-05', titulo: 'Sección herramientas', descripcion: 'Sección "Reservas automáticas" → renombrar a "Tu solución con muchas herramientas". Nuevo copy + animación con módulos/add-ons', prioridad: 'Media', asignado: 'Emilio', modulo: 'Landing' },
    { id: 'L-06', titulo: 'Ajustar textos afiliados', descripcion: 'Ajustar todo el texto de la página según el documento de contenido actualizado', prioridad: 'Media', asignado: 'Emilio', modulo: 'Afiliados LP' },
    { id: 'L-07', titulo: 'Flujo código invitación', descripcion: 'Revisar flujo: que pida código de quien te invitó (3%), que al iniciar sesión se dé código, y panel completo', prioridad: 'Alta', asignado: 'Damián', modulo: 'Afiliados LP' },
    { id: 'L-08', titulo: 'Registro afiliado sin negocio', descripcion: 'Que un usuario sin ser afiliado ni negocio pueda registrarse como afiliado sin problemas', prioridad: 'Alta', asignado: 'Damián', modulo: 'Afiliados LP' },
    { id: 'L-09', titulo: 'Quitar solicitud afiliado', descripcion: 'Quitar la parte de "solicitud de afiliado" en la sección Cómo Funciona', prioridad: 'Baja', asignado: 'Emilio', modulo: 'Afiliados LP' },
    { id: 'L-10', titulo: 'Ajustar mínimo puntos', descripcion: 'Ajustar mínimo de puntos para participar en podio (en lugar de mínimo 5 locales)', prioridad: 'Baja', asignado: 'Emilio', modulo: 'Afiliados LP' }
  ],
  'Subdominios Web': [
    { id: 'S-01', titulo: 'Registro en subdominios', descripcion: 'Permitir que afiliados o dueños de otro negocio se registren en subdominios para comprar/suscribirse. Dueños puedan comprar sus propias suscripciones', prioridad: 'Alta', asignado: 'Damián', modulo: 'Subdominio' },
    { id: 'S-02', titulo: 'Sync empleados/servicios', descripcion: 'Sincronizar empleados con servicios y reservas en la página web del subdominio', prioridad: 'Alta', asignado: 'Damián', modulo: 'Subdominio' },
    { id: 'S-03', titulo: 'Reserva sin registro', descripcion: 'Permitir reservar un servicio sin estar registrado (usuario guest)', prioridad: 'Media', asignado: 'Damián', modulo: 'Subdominio' },
    { id: 'S-04', titulo: 'Panel solicitud facturas', descripcion: 'Crear panel en la web del subdominio para que clientes puedan solicitar facturas', prioridad: 'Media', asignado: 'Damián', modulo: 'Subdominio' }
  ],
  'Admin Panel': [
    { id: 'AD-01', titulo: 'Renombrar métricas dashboard', descripcion: 'Quitar "Solicitudes pendientes". Cambiar "Total salones" → "Total negocios". Cambiar "Comisiones del mes" → "Ingresos mensuales" con filtros: 7d, 30d, 90d, anual, histórico', prioridad: 'Alta', asignado: 'Emilio', modulo: 'Dashboard' },
    { id: 'AD-02', titulo: 'Filtro por persona', descripcion: 'Agregar filtro por persona (futuro, documentar para después)', prioridad: 'Baja', asignado: 'Emilio', modulo: 'Dashboard' },
    { id: 'AD-03', titulo: 'Eliminar solicitudes', descripcion: 'Eliminar sección de solicitudes', prioridad: 'Baja', asignado: 'Emilio', modulo: 'Admin' },
    { id: 'AD-04', titulo: 'Gestión facturas admin', descripcion: 'Gestión de pagos: descargar facturas solicitadas por clientes + estados de cuenta mensuales', prioridad: 'Media', asignado: 'Emilio', modulo: 'Pagos' },
    { id: 'AD-05', titulo: 'Filtros búsqueda negocios', descripcion: 'Agregar filtros de búsqueda y paginación en "Todos los salones/negocios"', prioridad: 'Media', asignado: 'Emilio', modulo: 'Negocios' },
    { id: 'AD-06', titulo: 'Restringir acceso soporte', descripcion: 'Restringir acceso al módulo de soporte solo a ciertos usuarios autorizados', prioridad: 'Media', asignado: 'Emilio', modulo: 'Soporte' }
  ]
};

// Función para calcular fecha de vencimiento según prioridad
function calcularFechaVencimiento(prioridad, dias = 0) {
  const fecha = new Date(START_DATE);
  fecha.setDate(fecha.getDate() + dias);

  if (prioridad === 'Alta') {
    fecha.setDate(fecha.getDate() + 14); // 2 semanas
  } else if (prioridad === 'Media') {
    fecha.setDate(fecha.getDate() + 30); // 1 mes
  } else {
    fecha.setDate(fecha.getDate() + 60); // 2 meses
  }

  return fecha.toISOString().split('T')[0];
}

async function main() {
  const client = await pool.connect();

  try {
    console.log('🚀 Iniciando importación de tareas a STYLY...\n');

    // 1. Crear o encontrar usuarios
    console.log('👥 Configurando usuarios...');
    const userIds = { Damián: null, Emilio: null, Ambos: null };

    for (const [key, userData] of Object.entries(USERS)) {
      const userResult = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [userData.email]
      );

      if (userResult.rows.length === 0) {
        // Crear usuario si no existe
        const insertResult = await client.query(
          `INSERT INTO users (name, email, password_hash, role, businesses, status, activo)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [userData.name, userData.email, 'temp_hash', 'user', JSON.stringify(['styly']), 'active', true]
        );
        userIds[key] = insertResult.rows[0].id;
        console.log(`  ✓ Creado usuario: ${userData.name} (${userData.email})`);
      } else {
        userIds[key] = userResult.rows[0].id;
        console.log(`  ✓ Usuario encontrado: ${userData.name}`);
      }
    }

    // 2. Crear proyectos
    console.log('\n📦 Creando proyectos...');
    const projectIds = {};

    for (const project of PROJECTS) {
      const result = await client.query(
        `INSERT INTO styly_projects
         (nombre, descripcion, color, propietario_id, estado, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id`,
        [project.nombre, project.descripcion, project.color, ADMIN_USER_ID, 'activo']
      );

      const projectId = result.rows[0].id;
      projectIds[project.nombre] = projectId;
      console.log(`  ✓ ${project.emoji} ${project.nombre} (ID: ${projectId})`);
    }

    // 3. Crear todas las tareas
    console.log('\n📝 Creando tareas...');
    let totalCreadas = 0;
    let diasOffset = 0;

    for (const [projectName, tasks] of Object.entries(TASKS)) {
      const projectId = projectIds[
        Object.keys(projectIds).find(k => k.includes(projectName.split(' ')[0]))
      ];

      console.log(`\n  → Proyecto: ${projectName}`);

      for (const task of tasks) {
        // Determinar asignados
        const asignadosIds = [];
        if (task.asignado === 'Damián') {
          asignadosIds.push(userIds.Damián);
        } else if (task.asignado === 'Emilio') {
          asignadosIds.push(userIds.Emilio);
        } else if (task.asignado === 'Ambos') {
          asignadosIds.push(userIds.Damián, userIds.Emilio);
        }

        // Calcular fechas
        const fechaInicio = new Date(START_DATE);
        fechaInicio.setDate(fechaInicio.getDate() + diasOffset);
        const fechaVencimiento = calcularFechaVencimiento(task.prioridad, diasOffset);

        // Crear tarea
        const taskResult = await client.query(
          `INSERT INTO styly_tasks
           (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad,
            fecha_inicio, fecha_vencimiento, creado_por, position, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
           RETURNING id`,
          [
            task.id,
            task.titulo,
            task.descripcion,
            projectId,
            task.modulo,
            'Pendiente',
            task.prioridad,
            fechaInicio.toISOString().split('T')[0],
            fechaVencimiento,
            ADMIN_USER_ID,
            totalCreadas
          ]
        );

        const taskId = taskResult.rows[0].id;

        // Asignar usuarios
        for (const userId of asignadosIds) {
          await client.query(
            `INSERT INTO styly_task_asignados (task_id, user_id, created_at)
             VALUES ($1, $2, NOW())`,
            [taskId, userId]
          );
        }

        totalCreadas++;
        console.log(`    ✓ [${task.id}] ${task.titulo.substring(0, 50)}... (${task.prioridad})`);

        // Incrementar offset cada 3 tareas
        if (totalCreadas % 3 === 0) diasOffset++;
      }
    }

    console.log(`\n✅ Importación completada exitosamente!`);
    console.log(`📊 Resumen:`);
    console.log(`   - Proyectos creados: ${Object.keys(projectIds).length}`);
    console.log(`   - Tareas creadas: ${totalCreadas}`);
    console.log(`   - Usuarios configurados: ${Object.keys(userIds).length}`);
    console.log(`\n🎯 Accede a http://localhost:3001/styly.html para ver las tareas`);

  } catch (error) {
    console.error('❌ Error durante la importación:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar
main().catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});
