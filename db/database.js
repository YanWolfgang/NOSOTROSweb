const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'editor',
        businesses JSONB DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS content_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        business VARCHAR(50) NOT NULL,
        format_type VARCHAR(50) NOT NULL,
        input_data JSONB,
        output_text TEXT,
        status VARCHAR(20) DEFAULT 'draft',
        scheduled_date TIMESTAMP,
        scheduled_platform VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ideas (
        id SERIAL PRIMARY KEY,
        business VARCHAR(50) NOT NULL,
        idea_text TEXT NOT NULL,
        format VARCHAR(50),
        status VARCHAR(20) DEFAULT 'new',
        created_at TIMESTAMP DEFAULT NOW(),
        used_at TIMESTAMP
      );
    `);
    // Add columns if missing (safe for re-runs)
    await client.query(`
      ALTER TABLE ideas ADD COLUMN IF NOT EXISTS season_relevance VARCHAR(100);
      ALTER TABLE content_history ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS styly_modules JSONB DEFAULT '[]';
      ALTER TABLE styly_tasks ALTER COLUMN estado TYPE VARCHAR(50);
    `);

    // AI conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        business VARCHAR(50) DEFAULT 'general',
        title VARCHAR(200),
        messages JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
      );
      CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_ai_conv_expires ON ai_conversations(expires_at);
    `);

    // ========== STYLY: DROP OLD TABLES ==========
    // Drop all Styly tables to recreate with new schema (CASCADE will handle foreign keys)
    await client.query(`DROP TABLE IF EXISTS styly_comentarios CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS styly_subtasks CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS styly_task_observadores CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS styly_task_asignados CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS styly_tasks CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS styly_projects CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS styly_equipo_miembros CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS styly_equipos CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS styly_roles CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS styly_user_permissions CASCADE;`);

    // ========== STYLY: ROLES Y PERMISOS ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS styly_roles (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL UNIQUE,
        permisos JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== STYLY: EQUIPOS ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS styly_equipos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        lider_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS styly_equipo_miembros (
        id SERIAL PRIMARY KEY,
        equipo_id INTEGER REFERENCES styly_equipos(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(equipo_id, user_id)
      );
    `);

    // ========== STYLY: USUARIOS (extender tabla users) ==========
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS styly_role_id INTEGER REFERENCES styly_roles(id) ON DELETE SET NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS styly_equipo_id INTEGER REFERENCES styly_equipos(id) ON DELETE SET NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;
    `);

    // ========== STYLY: PROYECTOS ==========
    await client.query(`
      CREATE TABLE styly_projects (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        icono VARCHAR(50) DEFAULT 'folder',
        color VARCHAR(10),
        propietario_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        equipo_id INTEGER REFERENCES styly_equipos(id) ON DELETE SET NULL,
        fecha_inicio DATE,
        fecha_fin DATE,
        estado VARCHAR(20) DEFAULT 'activo',
        permisos JSONB DEFAULT '{}',
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== STYLY: TAREAS ==========
    await client.query(`
      CREATE TABLE styly_tasks (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(10) NOT NULL UNIQUE,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        notas TEXT,
        proyecto_id INTEGER REFERENCES styly_projects(id) ON DELETE CASCADE,
        seccion VARCHAR(50),
        estado VARCHAR(50) DEFAULT 'Pendiente',
        prioridad VARCHAR(10) DEFAULT 'Media',
        etiquetas JSONB DEFAULT '[]',
        duracion_estimada INTEGER,
        progreso INTEGER DEFAULT 0,
        fecha_inicio DATE,
        fecha_vencimiento DATE,
        creado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Tareas: Asignados (muchos a muchos)
    await client.query(`
      CREATE TABLE styly_task_asignados (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES styly_tasks(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(task_id, user_id)
      );
    `);

    // Tareas: Observadores (muchos a muchos)
    await client.query(`
      CREATE TABLE styly_task_observadores (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES styly_tasks(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(task_id, user_id)
      );
    `);

    // Tareas: Subtareas
    await client.query(`
      CREATE TABLE styly_subtasks (
        id SERIAL PRIMARY KEY,
        parent_task_id INTEGER REFERENCES styly_tasks(id) ON DELETE CASCADE,
        titulo VARCHAR(255) NOT NULL,
        completada BOOLEAN DEFAULT false,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== STYLY: COMENTARIOS ==========
    await client.query(`
      CREATE TABLE styly_comentarios (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES styly_tasks(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        contenido TEXT NOT NULL,
        archivos JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        editado_en TIMESTAMP
      );
    `);

    // ========== STYLY: ARCHIVOS DE TAREA ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS styly_task_archivos (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES styly_tasks(id) ON DELETE CASCADE,
        nombre VARCHAR(255) NOT NULL,
        tipo VARCHAR(100),
        tamano INTEGER,
        ruta VARCHAR(500) NOT NULL,
        subido_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_styly_tasks_proyecto ON styly_tasks(proyecto_id);
      CREATE INDEX IF NOT EXISTS idx_styly_tasks_estado ON styly_tasks(estado);
      CREATE INDEX IF NOT EXISTS idx_styly_tasks_creado_por ON styly_tasks(creado_por);
      CREATE INDEX IF NOT EXISTS idx_styly_task_asignados_task ON styly_task_asignados(task_id);
      CREATE INDEX IF NOT EXISTS idx_styly_task_asignados_user ON styly_task_asignados(user_id);
      CREATE INDEX IF NOT EXISTS idx_styly_comentarios_task ON styly_comentarios(task_id);
      CREATE INDEX IF NOT EXISTS idx_styly_task_archivos_task ON styly_task_archivos(task_id);
    `);

    // ========== STYLY: ROLES POR DEFECTO ==========
    const { rows: rolesExist } = await client.query("SELECT id FROM styly_roles LIMIT 1");
    if (rolesExist.length === 0) {
      await client.query(`
        INSERT INTO styly_roles (nombre, permisos) VALUES
        ('Admin', '{"crear_tarea":true,"asignar":true,"cambiar_estado":true,"eliminar":true,"comentar":true,"ver_reportes":true,"gestionar_equipo":true}'),
        ('Manager', '{"crear_tarea":true,"asignar":true,"cambiar_estado":true,"eliminar":false,"comentar":true,"ver_reportes":true,"gestionar_equipo":false}'),
        ('Developer', '{"crear_tarea":true,"asignar":false,"cambiar_estado":true,"eliminar":false,"comentar":true,"ver_reportes":false,"gestionar_equipo":false}'),
        ('Viewer', '{"crear_tarea":false,"asignar":false,"cambiar_estado":false,"eliminar":false,"comentar":true,"ver_reportes":false,"gestionar_equipo":false}')
      `);
      console.log('Roles de STYLY creados');
    }

    // Crear admin si no existe
    const { rows } = await client.query("SELECT id FROM users WHERE email = 'yan@admin.com'");
    if (rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await client.query(
        "INSERT INTO users (name, email, password_hash, role, businesses, status) VALUES ($1, $2, $3, $4, $5, $6)",
        ['Admin', 'yan@admin.com', hash, 'admin', JSON.stringify(['nosotros','duelazo','spacebox','styly']), 'active']
      );
      console.log('Admin creado: yan@admin.com / admin123');
    }

    // Asignar rol Admin de STYLY al admin principal
    const { rows: adminRows } = await client.query("SELECT id FROM users WHERE email = 'yan@admin.com'");
    if (adminRows.length > 0) {
      const { rows: adminRole } = await client.query("SELECT id FROM styly_roles WHERE nombre = 'Admin'");
      if (adminRole.length > 0) {
        await client.query("UPDATE users SET styly_role_id = $1 WHERE id = $2", [adminRole[0].id, adminRows[0].id]);
      }
    }

    // ========== QUINIELA: TABLAS ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS quinielas (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        creador_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        deporte VARCHAR(50) DEFAULT 'football',
        estado VARCHAR(20) DEFAULT 'abierta',
        fecha_limite TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS quiniela_partidos (
        id SERIAL PRIMARY KEY,
        quiniela_id INTEGER REFERENCES quinielas(id) ON DELETE CASCADE,
        fixture_id INTEGER,
        deporte VARCHAR(50) DEFAULT 'football',
        equipo_local VARCHAR(100),
        equipo_visitante VARCHAR(100),
        logo_local VARCHAR(255),
        logo_visitante VARCHAR(255),
        liga VARCHAR(100),
        fecha_partido TIMESTAMP,
        goles_local INTEGER,
        goles_visitante INTEGER,
        estado VARCHAR(20) DEFAULT 'pendiente'
      );
      CREATE TABLE IF NOT EXISTS quiniela_participantes (
        id SERIAL PRIMARY KEY,
        quiniela_id INTEGER REFERENCES quinielas(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        puntos_total INTEGER DEFAULT 0,
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(quiniela_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS quiniela_predicciones (
        id SERIAL PRIMARY KEY,
        quiniela_id INTEGER REFERENCES quinielas(id) ON DELETE CASCADE,
        partido_id INTEGER REFERENCES quiniela_partidos(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        prediccion VARCHAR(10) NOT NULL,
        correcta BOOLEAN,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(partido_id, user_id)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quiniela_creador ON quinielas(creador_id);
      CREATE INDEX IF NOT EXISTS idx_quiniela_partidos_q ON quiniela_partidos(quiniela_id);
      CREATE INDEX IF NOT EXISTS idx_quiniela_participantes_q ON quiniela_participantes(quiniela_id);
      CREATE INDEX IF NOT EXISTS idx_quiniela_predicciones_q ON quiniela_predicciones(quiniela_id);
      CREATE INDEX IF NOT EXISTS idx_quiniela_predicciones_user ON quiniela_predicciones(user_id);
    `);

    console.log('Base de datos inicializada');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
