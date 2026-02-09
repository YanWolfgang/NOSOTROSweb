try {
  require('dotenv').config();
  const express = require('express');
  const path = require('path');
  const { pool, initDB } = require('./db/database');
  
  console.log('✅ dotenv loaded');
  console.log('✅ express loaded');
  console.log('✅ pool loaded');
  
  // Try requiring routes
  try {
    const authRoutes = require('./routes/auth');
    console.log('✅ auth routes loaded');
  } catch(e) {
    console.error('❌ auth routes error:', e.message);
  }
  
  try {
    const stylyRoutes = require('./routes/styly');
    console.log('✅ styly routes loaded');
  } catch(e) {
    console.error('❌ styly routes error:', e.message);
  }
  
} catch(e) {
  console.error('Error:', e.message);
}
