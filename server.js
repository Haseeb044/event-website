const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'eventuser',
  password: process.env.DB_PASSWORD || 'eventpass123',
  database: process.env.DB_NAME || 'eventdb'
});

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_users (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS hackathon_registrations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES app_users(id),
    team_name TEXT NOT NULL,
    university TEXT NOT NULL,
    track TEXT NOT NULL,
    phone TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: 'Please log in first' });
  }
}

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (e) {
    res.status(500).json({ status: 'error', database: 'down' });
  }
});

app.post('/api/signup', async (req, res) => {
  try {
    const { full_name, email, password } = req.body;
    if (!full_name || !email || !password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'All fields required, password min 6 characters' });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO app_users (full_name, email, password_hash) VALUES ($1, $2, $3)',
      [full_name, email.toLowerCase(), hash]
    );
    res.json({ success: true, message: 'Account created. Please log in.' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'Email already registered' });
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const r = await pool.query('SELECT * FROM app_users WHERE email = $1', [(email || '').toLowerCase()]);
    if (r.rowCount && await bcrypt.compare(password || '', r.rows[0].password_hash)) {
      const u = r.rows[0];
      const token = jwt.sign({ id: u.id, name: u.full_name, email: u.email }, JWT_SECRET, { expiresIn: '2h' });
      return res.json({ success: true, token });
    }
    res.status(401).json({ success: false, message: 'Invalid email or password' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT team_name, university, track, phone, created_at FROM hackathon_registrations WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ success: true, user: { name: req.user.name, email: req.user.email }, registration: r.rows[0] || null });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/hackathon/register', auth, async (req, res) => {
  try {
    const { team_name, university, track, phone } = req.body;
    if (!team_name || !university || !track) {
      return res.status(400).json({ success: false, message: 'Team name, university and track are required' });
    }
    await pool.query(
      'INSERT INTO hackathon_registrations (user_id, team_name, university, track, phone) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, team_name, university, track, phone]
    );
    res.json({ success: true, message: 'Registered for the Hackathon!' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'You are already registered' });
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

async function start() {
  for (let i = 1; i <= 10; i++) {
    try { await initDb(); break; }
    catch (e) {
      console.log('Waiting for database... attempt ' + i);
      if (i === 10) { console.error(e); process.exit(1); }
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('Server running on port ' + PORT));
}

if (require.main === module) start();
module.exports = app;
