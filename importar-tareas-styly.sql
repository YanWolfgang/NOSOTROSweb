-- Script SQL para importar 65 tareas del plan de desarrollo a STYLY
-- Ejecutar en la consola de PostgreSQL de Render

-- 1. Crear usuarios (si no existen)
INSERT INTO users (name, email, password_hash, role, businesses, status, activo)
VALUES
  ('Damián', 'damian@styly.mx', '$2b$10$dummyhash1', 'user', '["styly"]', 'active', true),
  ('Emilio', 'emilio@styly.mx', '$2b$10$dummyhash2', 'user', '["styly"]', 'active', true)
ON CONFLICT (email) DO NOTHING;

-- 2. Crear 5 proyectos
WITH inserted_projects AS (
  INSERT INTO styly_projects (nombre, descripcion, color, propietario_id, estado, created_at)
  VALUES
    ('🏢 STYLY Panel', 'Panel de negocios principal - Dashboard, mensajes, pagos, tareas, facturación', '#8b5cf6', 1, 'activo', NOW()),
    ('👥 Panel Afiliados', 'Panel para afiliados elite - Puntaje, comisiones, Academy, consultoría', '#10b981', 1, 'activo', NOW()),
    ('🌐 Landing Pages', 'Landing principal y página de afiliados - Hero, demos, chatbot', '#f59e0b', 1, 'activo', NOW()),
    ('🏪 Subdominios Web', 'Tiendas web de clientes - Registro, reservas, facturación', '#3b82f6', 1, 'activo', NOW()),
    ('⚙️ Admin Panel', 'Panel administrativo interno - Dashboard, pagos, negocios, soporte', '#ef4444', 1, 'activo', NOW())
  RETURNING id, nombre
)
SELECT * FROM inserted_projects;

-- 3. Obtener IDs de usuarios y proyectos
DO $$
DECLARE
  damian_id INT;
  emilio_id INT;
  proyecto1_id INT;
  proyecto2_id INT;
  proyecto3_id INT;
  proyecto4_id INT;
  proyecto5_id INT;
BEGIN
  -- Obtener IDs
  SELECT id INTO damian_id FROM users WHERE email = 'damian@styly.mx';
  SELECT id INTO emilio_id FROM users WHERE email = 'emilio@styly.mx';
  SELECT id INTO proyecto1_id FROM styly_projects WHERE nombre LIKE '%STYLY Panel%';
  SELECT id INTO proyecto2_id FROM styly_projects WHERE nombre LIKE '%Panel Afiliados%';
  SELECT id INTO proyecto3_id FROM styly_projects WHERE nombre LIKE '%Landing Pages%';
  SELECT id INTO proyecto4_id FROM styly_projects WHERE nombre LIKE '%Subdominios%';
  SELECT id INTO proyecto5_id FROM styly_projects WHERE nombre LIKE '%Admin Panel%';

  -- ========== BLOQUE 1: STYLY PANEL (22 tareas) ==========

  -- Dashboard
  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-01', 'Banner notificaciones carrusel', 'Reemplazar banner de bienvenida por ventana de notificaciones tipo carrusel (dismissable). Primera notificación: "Bienvenido de vuelta"', proyecto1_id, 'Dashboard', 'Pendiente', 'Alta', '2026-02-10', '2026-02-24', 1, 0);
  INSERT INTO styly_task_asignados (task_id, user_id) VALUES ((SELECT id FROM styly_tasks WHERE task_id = 'P-01'), emilio_id);

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-02', 'Insights del negocio', 'Agregar insights: clientes ganados/perdidos vs mes anterior, suscripciones nuevas/perdidas, ingresos por suscripciones, citas del mes', proyecto1_id, 'Dashboard', 'Pendiente', 'Alta', '2026-02-10', '2026-02-24', 1, 1);
  INSERT INTO styly_task_asignados (task_id, user_id) VALUES ((SELECT id FROM styly_tasks WHERE task_id = 'P-02'), emilio_id);

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-03', 'Descargar reporte dashboard', 'Botón para descargar reporte del dashboard en Excel y PDF', proyecto1_id, 'Dashboard', 'Pendiente', 'Media', '2026-02-10', '2026-03-12', 1, 2);
  INSERT INTO styly_task_asignados (task_id, user_id) VALUES ((SELECT id FROM styly_tasks WHERE task_id = 'P-03'), emilio_id);

  -- Mensajes
  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-04', 'Mails masivos + templates', 'Módulo de envío de mails masivos (promociones). Incluir 2 templates HTML personalizables (color, imágenes, texto)', proyecto1_id, 'Mensajes', 'Pendiente', 'Alta', '2026-02-11', '2026-02-25', 1, 3);
  INSERT INTO styly_task_asignados (task_id, user_id) VALUES ((SELECT id FROM styly_tasks WHERE task_id = 'P-04'), damian_id);

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-05', 'Conectar email del dueño', 'Conectar email del dueño o email configurado para envío de mensajes desde el módulo', proyecto1_id, 'Mensajes', 'Pendiente', 'Alta', '2026-02-11', '2026-02-25', 1, 4);
  INSERT INTO styly_task_asignados (task_id, user_id) VALUES ((SELECT id FROM styly_tasks WHERE task_id = 'P-05'), damian_id);

  -- Pagos
  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-06', 'Pago manual sin servicio', 'Permitir registrar un pago manual aunque no exista el servicio asociado (pago libre)', proyecto1_id, 'Pagos', 'Pendiente', 'Media', '2026-02-11', '2026-03-13', 1, 5),
  ('P-07', 'Filtro pagos por fechas', 'Filtrar pagos por rango de fechas personalizado y descargar reporte en PDF, CSV o Excel', proyecto1_id, 'Pagos', 'Pendiente', 'Media', '2026-02-12', '2026-03-14', 1, 6),
  ('P-08', 'Panel admin facturas', 'Panel para administrar facturas generadas anteriormente', proyecto1_id, 'Pagos', 'Pendiente', 'Media', '2026-02-12', '2026-03-14', 1, 7);
  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, damian_id FROM styly_tasks WHERE task_id IN ('P-06', 'P-07', 'P-08');

  -- Tareas
  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-09', 'Notificaciones eventos', 'Notificaciones al usuario en StylyPanel cada que hay un nuevo evento', proyecto1_id, 'Tareas', 'Pendiente', 'Alta', '2026-02-12', '2026-02-26', 1, 8),
  ('P-10', 'CRUD columnas tablero', 'Permitir agregar, renombrar y eliminar columnas en el tablero de tareas', proyecto1_id, 'Tareas', 'Pendiente', 'Media', '2026-02-13', '2026-03-15', 1, 9),
  ('P-11', 'Drag & drop móvil', 'En móvil: drag & drop intuitivo para mover tareas entre columnas', proyecto1_id, 'Tareas', 'Pendiente', 'Media', '2026-02-13', '2026-03-15', 1, 10);
  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, damian_id FROM styly_tasks WHERE task_id IN ('P-09', 'P-10', 'P-11');

  -- Tickets
  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-12', 'Renombrar a Tickets', 'Renombrar módulo "Soporte" a "Tickets"', proyecto1_id, 'Tickets', 'Pendiente', 'Baja', '2026-02-13', '2026-04-14', 1, 11),
  ('P-13', 'Auto-envío tickets', 'Auto-envío de mensajes de atención al cliente con notificación push al usuario', proyecto1_id, 'Tickets', 'Pendiente', 'Alta', '2026-02-14', '2026-02-28', 1, 12);
  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, damian_id FROM styly_tasks WHERE task_id IN ('P-12', 'P-13');

  -- Cuenta
  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-14', 'Revisar descargar datos', 'Revisar funcionalidad de "Descargar datos" — verificar qué datos descarga y que funcione', proyecto1_id, 'Cuenta', 'Pendiente', 'Baja', '2026-02-14', '2026-04-15', 1, 13),
  ('P-15', 'Verificar email soporte', 'Verificar que el email de soporte (soporte@styly.mx) reciba mensajes de prueba', proyecto1_id, 'Cuenta', 'Pendiente', 'Baja', '2026-02-14', '2026-04-15', 1, 14),
  ('P-16', 'Auth 2 pasos', 'Configurar autenticación de dos pasos con todos los métodos disponibles', proyecto1_id, 'Cuenta', 'Pendiente', 'Alta', '2026-02-15', '2026-03-01', 1, 15);
  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, emilio_id FROM styly_tasks WHERE task_id IN ('P-14', 'P-15', 'P-16');

  -- Registro
  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-17', 'Términos y condiciones', 'Agregar términos y condiciones de Styly en el formulario de registro (Google y normal)', proyecto1_id, 'Registro', 'Pendiente', 'Alta', '2026-02-15', '2026-03-01', 1, 16);
  INSERT INTO styly_task_asignados (task_id, user_id) VALUES ((SELECT id FROM styly_tasks WHERE task_id = 'P-17'), damian_id);

  -- Métricas+ e IA
  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-18', 'Dropdown móvil Métricas+', 'Dropdown menu en móvil para todas las secciones Plus y selección de datos de gráfica', proyecto1_id, 'Métricas+', 'Pendiente', 'Media', '2026-02-15', '2026-03-17', 1, 17),
  ('P-19', 'Herramienta IA lateral', 'Herramienta de IA en barra lateral para consultas sobre el negocio. Descargar consultas. Disclaimer: chat se borra en 7 días', proyecto1_id, 'IA', 'Pendiente', 'Media', '2026-02-16', '2026-03-18', 1, 18);
  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, emilio_id FROM styly_tasks WHERE task_id IN ('P-18', 'P-19');

  -- Facturación
  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-20', 'Panel facturación SAT', 'Crear panel de facturación para negocios: generar factura fiscal que timbre al SAT. Integración con Facturapi o Gigstack', proyecto1_id, 'Facturación', 'Pendiente', 'Alta', '2026-02-16', '2026-03-02', 1, 19),
  ('P-21', 'Onboarding Stripe integrado', 'Quitar onboarding de Stripe externo; reemplazar por onboarding integrado dentro del panel', proyecto1_id, 'Stripe', 'Pendiente', 'Alta', '2026-02-16', '2026-03-02', 1, 20);
  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, damian_id FROM styly_tasks WHERE task_id IN ('P-20', 'P-21');

  -- QA
  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('P-22', 'QA General Panel', 'Revisión completa de conectividad y funcionamiento: filtros, diseños, métricas plus, flujos completos', proyecto1_id, 'QA', 'Pendiente', 'Alta', '2026-02-17', '2026-03-03', 1, 21);
  INSERT INTO styly_task_asignados (task_id, user_id) VALUES ((SELECT id FROM styly_tasks WHERE task_id = 'P-22'), damian_id);
  INSERT INTO styly_task_asignados (task_id, user_id) VALUES ((SELECT id FROM styly_tasks WHERE task_id = 'P-22'), emilio_id);

  -- ========== BLOQUE 2: PANEL AFILIADOS (23 tareas) ==========

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('A-01', 'Sistema puntaje real', 'Que funcione el sistema de puntaje real (puntos reales, no demo)', proyecto2_id, 'Puntaje', 'Pendiente', 'Alta', '2026-02-17', '2026-03-03', 1, 22),
  ('A-02', 'Sección crucero', 'Agregar sección del crucero en el tablero de puntaje', proyecto2_id, 'Puntaje', 'Pendiente', 'Media', '2026-02-17', '2026-03-19', 1, 23),
  ('A-03', 'Widget comisiones', 'Widget de tasa de comisiones: componente con todas las comisiones desglosadas y paginadas', proyecto2_id, 'Comisiones', 'Pendiente', 'Media', '2026-02-18', '2026-03-20', 1, 24),
  ('A-04', '50% primera venta', 'Aplicar 50% en primera venta + mensaje en Academy notificando esto al terminar curso y certificado', proyecto2_id, 'Comisiones', 'Pendiente', 'Alta', '2026-02-18', '2026-03-04', 1, 25),
  ('A-05', 'Descargar historial pagos', 'Poder descargar historial de pagos completo', proyecto2_id, 'Pagos', 'Pendiente', 'Media', '2026-02-18', '2026-03-20', 1, 26),
  ('A-06', 'Verificar export referidos', 'Verificar que se exporten los datos de referidos correctamente', proyecto2_id, 'Referidos', 'Pendiente', 'Media', '2026-02-19', '2026-03-21', 1, 27),
  ('A-07', 'Descargar reporte referidos', 'Botón de descargar reporte en PDF y Excel', proyecto2_id, 'Referidos', 'Pendiente', 'Media', '2026-02-19', '2026-03-21', 1, 28);

  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, emilio_id FROM styly_tasks WHERE task_id IN ('A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06', 'A-07');

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('A-08', 'Módulos 3 y 4 Academy', 'Agregar módulos 3 y 4 a Academy', proyecto2_id, 'Academy', 'Pendiente', 'Alta', '2026-02-19', '2026-03-05', 1, 29),
  ('A-09', 'Unificar 5 módulos curso', 'Meter los primeros 5 módulos como un solo curso con el nombre del certificado', proyecto2_id, 'Academy', 'Pendiente', 'Media', '2026-02-20', '2026-03-22', 1, 30),
  ('A-10', 'Cambiar duración módulos', 'Cambiar duración de módulos de la academy', proyecto2_id, 'Academy', 'Pendiente', 'Baja', '2026-02-20', '2026-04-21', 1, 31),
  ('A-11', 'Certificado al terminar', 'Al terminar la academy, mostrar certificado al usuario', proyecto2_id, 'Academy', 'Pendiente', 'Alta', '2026-02-20', '2026-03-06', 1, 32);

  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, damian_id FROM styly_tasks WHERE task_id IN ('A-08', 'A-09', 'A-10', 'A-11');

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('A-12', 'Módulo consultoría + survey', 'Crear módulo "Consultoría" en menú lateral. Survey para recabar info del negocio. Cada pregunta ligada a extensión', proyecto2_id, 'Consultoría', 'Pendiente', 'Alta', '2026-02-21', '2026-03-07', 1, 33),
  ('A-13', 'Sugerencias + análisis', 'Herramienta sugiere extensiones basado en respuestas. Generar análisis descargable con link de afiliado', proyecto2_id, 'Consultoría', 'Pendiente', 'Alta', '2026-02-21', '2026-03-07', 1, 34),
  ('A-14', 'Premios mensuales admin', 'Agregar premios mensuales administrables en clasificación global', proyecto2_id, 'Clasificación', 'Pendiente', 'Media', '2026-02-21', '2026-03-23', 1, 35),
  ('A-15', 'Banner crucero', 'Banner del crucero Styly en la clasificación global', proyecto2_id, 'Clasificación', 'Pendiente', 'Baja', '2026-02-22', '2026-04-23', 1, 36);

  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, emilio_id FROM styly_tasks WHERE task_id IN ('A-12', 'A-13', 'A-14', 'A-15');

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('A-16', 'Sync columnas tareas', 'Reflejar mismos ajustes que Panel Styly: agregar/quitar/renombrar columnas', proyecto2_id, 'Tareas', 'Pendiente', 'Media', '2026-02-22', '2026-03-24', 1, 37);

  INSERT INTO styly_task_asignados (task_id, user_id) VALUES ((SELECT id FROM styly_tasks WHERE task_id = 'A-16'), damian_id);

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('A-17', 'Textos invitación redes', 'Cambiar los textos de invitación de las redes sociales en "Mi Enlace"', proyecto2_id, 'Enlace', 'Pendiente', 'Baja', '2026-02-22', '2026-04-23', 1, 38),
  ('A-18', 'Kit de afiliado', 'Implementar el kit de afiliado completo', proyecto2_id, 'Kit', 'Pendiente', 'Media', '2026-02-23', '2026-03-25', 1, 39),
  ('A-19', 'Add-ons sin bloqueos demo', 'En modo demo de Styly Panel, mostrar los add-ons sin bloqueos', proyecto2_id, 'Demo', 'Pendiente', 'Baja', '2026-02-23', '2026-04-24', 1, 40),
  ('A-20', 'Ajustar msg bienvenida', 'Ajustar mensaje de bienvenida del panel de afiliados', proyecto2_id, 'UI', 'Pendiente', 'Baja', '2026-02-23', '2026-04-24', 1, 41),
  ('A-21', 'Renombrar Tickets→Soporte', 'Cambiar nombre de "Tickets" a "Soporte"', proyecto2_id, 'UI', 'Pendiente', 'Baja', '2026-02-24', '2026-04-25', 1, 42);

  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, emilio_id FROM styly_tasks WHERE task_id IN ('A-17', 'A-18', 'A-19', 'A-20', 'A-21');

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('A-22', 'Botón afiliado cuenta exist', 'Que funcione botón "Quiero ser afiliado" con cuenta ya registrada', proyecto2_id, 'Registro', 'Pendiente', 'Alta', '2026-02-24', '2026-03-10', 1, 43),
  ('A-23', 'Botón dejar afiliado', 'Agregar botón de "Dejar de ser afiliado" en panel de afiliado', proyecto2_id, 'Registro', 'Pendiente', 'Baja', '2026-02-24', '2026-04-25', 1, 44);

  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, damian_id FROM styly_tasks WHERE task_id IN ('A-22', 'A-23');

  -- ========== BLOQUE 3: LANDING PAGES (10 tareas) ==========

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('L-01', 'Vista previa add-ons', 'Agregar vista previa de los add-ons al abrir detalles', proyecto3_id, 'Landing', 'Pendiente', 'Media', '2026-02-25', '2026-03-27', 1, 45),
  ('L-02', 'Demo interactiva panel', 'Agregar demo interactiva del panel para visitantes', proyecto3_id, 'Landing', 'Pendiente', 'Media', '2026-02-25', '2026-03-27', 1, 46),
  ('L-03', 'Chatbot FAQ', 'Chatbot de preguntas y respuestas predeterminadas', proyecto3_id, 'Landing', 'Pendiente', 'Media', '2026-02-25', '2026-03-27', 1, 47),
  ('L-04', 'Imagen hero section', 'Cambiar animación del hero section por imagen real del panel', proyecto3_id, 'Landing', 'Pendiente', 'Baja', '2026-02-26', '2026-04-27', 1, 48),
  ('L-05', 'Sección herramientas', 'Renombrar sección + nuevo copy + animación con módulos', proyecto3_id, 'Landing', 'Pendiente', 'Media', '2026-02-26', '2026-03-28', 1, 49),
  ('L-06', 'Ajustar textos afiliados', 'Ajustar todo el texto de la página según documento actualizado', proyecto3_id, 'Afiliados LP', 'Pendiente', 'Media', '2026-02-26', '2026-03-28', 1, 50);

  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, emilio_id FROM styly_tasks WHERE task_id IN ('L-01', 'L-02', 'L-03', 'L-04', 'L-05', 'L-06');

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('L-07', 'Flujo código invitación', 'Flujo: pedir código invitación (3%), al iniciar sesión dar código, panel completo', proyecto3_id, 'Afiliados LP', 'Pendiente', 'Alta', '2026-02-27', '2026-03-13', 1, 51),
  ('L-08', 'Registro afiliado sin negocio', 'Usuario sin ser afiliado ni negocio pueda registrarse como afiliado', proyecto3_id, 'Afiliados LP', 'Pendiente', 'Alta', '2026-02-27', '2026-03-13', 1, 52);

  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, damian_id FROM styly_tasks WHERE task_id IN ('L-07', 'L-08');

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('L-09', 'Quitar solicitud afiliado', 'Quitar parte de "solicitud de afiliado" en sección Cómo Funciona', proyecto3_id, 'Afiliados LP', 'Pendiente', 'Baja', '2026-02-27', '2026-04-28', 1, 53),
  ('L-10', 'Ajustar mínimo puntos', 'Ajustar mínimo de puntos para participar en podio', proyecto3_id, 'Afiliados LP', 'Pendiente', 'Baja', '2026-02-28', '2026-04-29', 1, 54);

  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, emilio_id FROM styly_tasks WHERE task_id IN ('L-09', 'L-10');

  -- ========== BLOQUE 4: SUBDOMINIOS (4 tareas) ==========

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('S-01', 'Registro en subdominios', 'Permitir registro en subdominios para comprar/suscribirse', proyecto4_id, 'Subdominio', 'Pendiente', 'Alta', '2026-02-28', '2026-03-14', 1, 55),
  ('S-02', 'Sync empleados/servicios', 'Sincronizar empleados con servicios y reservas en web del subdominio', proyecto4_id, 'Subdominio', 'Pendiente', 'Alta', '2026-02-28', '2026-03-14', 1, 56),
  ('S-03', 'Reserva sin registro', 'Permitir reservar un servicio sin estar registrado (usuario guest)', proyecto4_id, 'Subdominio', 'Pendiente', 'Media', '2026-03-01', '2026-03-31', 1, 57),
  ('S-04', 'Panel solicitud facturas', 'Crear panel en web del subdominio para solicitar facturas', proyecto4_id, 'Subdominio', 'Pendiente', 'Media', '2026-03-01', '2026-03-31', 1, 58);

  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, damian_id FROM styly_tasks WHERE task_id IN ('S-01', 'S-02', 'S-03', 'S-04');

  -- ========== BLOQUE 5: ADMIN PANEL (6 tareas) ==========

  INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, estado, prioridad, fecha_inicio, fecha_vencimiento, creado_por, position) VALUES
  ('AD-01', 'Renombrar métricas dashboard', 'Cambiar métricas + agregar filtros de tiempo', proyecto5_id, 'Dashboard', 'Pendiente', 'Alta', '2026-03-01', '2026-03-15', 1, 59),
  ('AD-02', 'Filtro por persona', 'Agregar filtro por persona (documentar para futuro)', proyecto5_id, 'Dashboard', 'Pendiente', 'Baja', '2026-03-02', '2026-05-01', 1, 60),
  ('AD-03', 'Eliminar solicitudes', 'Eliminar sección de solicitudes', proyecto5_id, 'Admin', 'Pendiente', 'Baja', '2026-03-02', '2026-05-01', 1, 61),
  ('AD-04', 'Gestión facturas admin', 'Descargar facturas solicitadas + estados de cuenta mensuales', proyecto5_id, 'Pagos', 'Pendiente', 'Media', '2026-03-02', '2026-04-01', 1, 62),
  ('AD-05', 'Filtros búsqueda negocios', 'Agregar filtros de búsqueda y paginación en todos los negocios', proyecto5_id, 'Negocios', 'Pendiente', 'Media', '2026-03-03', '2026-04-02', 1, 63),
  ('AD-06', 'Restringir acceso soporte', 'Restringir acceso al módulo de soporte a usuarios autorizados', proyecto5_id, 'Soporte', 'Pendiente', 'Media', '2026-03-03', '2026-04-02', 1, 64);

  INSERT INTO styly_task_asignados (task_id, user_id) SELECT id, emilio_id FROM styly_tasks WHERE task_id IN ('AD-01', 'AD-02', 'AD-03', 'AD-04', 'AD-05', 'AD-06');

END $$;

-- Verificar resultados
SELECT
  p.nombre as proyecto,
  COUNT(t.id) as total_tareas,
  COUNT(CASE WHEN t.prioridad = 'Alta' THEN 1 END) as alta,
  COUNT(CASE WHEN t.prioridad = 'Media' THEN 1 END) as media,
  COUNT(CASE WHEN t.prioridad = 'Baja' THEN 1 END) as baja
FROM styly_projects p
LEFT JOIN styly_tasks t ON t.proyecto_id = p.id
WHERE p.nombre LIKE '%Panel%' OR p.nombre LIKE '%Landing%' OR p.nombre LIKE '%Subdominio%' OR p.nombre LIKE '%Admin%'
GROUP BY p.nombre
ORDER BY p.id;

SELECT '✅ Importación completada: 65 tareas creadas en 5 proyectos' as resultado;
