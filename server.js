require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  const health = { status: 'ok', time: new Date().toISOString(), database: 'not_configured' };
  if (pool) {
    try {
      await pool.query('SELECT 1');
      health.database = 'connected';
    } catch (err) {
      health.database = 'error';
      health.databaseError = err.message;
    }
  }
  res.json(health);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Apex Oracle listening on port ${PORT}`));
