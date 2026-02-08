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

    // Styly Projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS styly_projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        color VARCHAR(10),
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Styly Tasks table - first ensure project_id column exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS styly_tasks (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(10) NOT NULL UNIQUE,
        module VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        priority VARCHAR(10),
        assigned_to VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pendiente',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Add project_id column if missing (safe for existing tables)
    await client.query(`
      ALTER TABLE styly_tasks ADD COLUMN IF NOT EXISTS project_id INTEGER;
    `);

    // Add foreign key constraint if missing
    try {
      await client.query(`
        ALTER TABLE styly_tasks ADD CONSTRAINT fk_styly_tasks_project
        FOREIGN KEY (project_id) REFERENCES styly_projects(id) ON DELETE CASCADE;
      `);
    } catch (e) {
      // Constraint might already exist, ignore
    }

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_styly_tasks_assigned ON styly_tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_styly_tasks_status ON styly_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_styly_tasks_project ON styly_tasks(project_id);
    `);

    // Add new columns for task manager redesign
    await client.query(`
      ALTER TABLE styly_tasks ADD COLUMN IF NOT EXISTS due_date DATE;
      ALTER TABLE styly_tasks ADD COLUMN IF NOT EXISTS start_date DATE;
      ALTER TABLE styly_tasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
    `);

    // Clear all existing tasks (fresh start) and reset sequence
    await client.query(`DELETE FROM styly_tasks;`);
    await client.query(`ALTER SEQUENCE styly_tasks_id_seq RESTART WITH 1;`);

    // Styly User Permissions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS styly_user_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        module VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, module)
      );
    `);

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
    console.log('Base de datos inicializada');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
