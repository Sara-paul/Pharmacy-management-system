require('dotenv').config();
const express = require('express'), cors = require('cors'), mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');

const app = express();
app.use(cors(), express.json());
const pool = mysql.createPool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, waitForConnections: true
});
const SECRET = process.env.JWT_SECRET || 'secret';

const auth = (...roles) => (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').split(' ')[1], SECRET);
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Access denied for your role' });
    next();
  } catch { res.status(401).json({ error: 'Please login again' }); }
};
const wrap = f => (req, res) => f(req, res).catch(e => { console.error(e); res.status(500).json({ error: e.sqlMessage || e.message }); });
const token = u => jwt.sign({ id: u.id, role: u.role, name: u.name }, SECRET, { expiresIn: '8h' });

// ---------- Auth ----------
app.post('/api/login', wrap(async (req, res) => {
  const { username, password } = req.body;
  const [r] = await pool.query('SELECT * FROM users WHERE username=?', [username]);
  if (!r.length || !(await bcrypt.compare(password || '', r[0].password_hash)))
    return res.status(401).json({ error: 'Invalid username or password' });
  res.json({ token: token(r[0]), user: { id: r[0].id, name: r[0].name, role: r[0].role } });
}));

app.post('/api/register', wrap(async (req, res) => {   // normal users (customers)
  const { name, username, password } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'All fields required' });
  const [e] = await pool.query('SELECT id FROM users WHERE username=?', [username]);
  if (e.length) return res.status(400).json({ error: 'Username already taken' });
  await pool.query('INSERT INTO users(name,username,password_hash,role) VALUES(?,?,?,?)',
    [name, username, await bcrypt.hash(password, 10), 'customer']);
  res.json({ ok: true });
}));

// ---------- Medicines ----------
app.get('/api/medicines', auth(), wrap(async (_q, res) =>
  res.json((await pool.query('SELECT * FROM medicines ORDER BY name'))[0])));
app.post('/api/medicines', auth('admin', 'pharmacist'), wrap(async (req, res) => {
  const { name, category, price, stock, expiry_date } = req.body;
  await pool.query('INSERT INTO medicines(name,category,price,stock,expiry_date) VALUES(?,?,?,?,?)',
    [name, category, price, stock, expiry_date || null]);
  res.json({ ok: true });
}));
app.put('/api/medicines/:id', auth('admin', 'pharmacist'), wrap(async (req, res) => {
  const { name, category, price, stock, expiry_date } = req.body;
  await pool.query('UPDATE medicines SET name=?,category=?,price=?,stock=?,expiry_date=? WHERE id=?',
    [name, category, price, stock, expiry_date ? expiry_date.slice(0, 10) : null, req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/medicines/:id', auth('admin'), wrap(async (req, res) => {
  await pool.query('DELETE FROM medicines WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- Users (admin) ----------
app.get('/api/users', auth('admin'), wrap(async (_q, res) =>
  res.json((await pool.query('SELECT id,name,username,role,created_at FROM users ORDER BY id'))[0])));
app.post('/api/users', auth('admin'), wrap(async (req, res) => {
  const { name, username, password, role } = req.body;
  await pool.query('INSERT INTO users(name,username,password_hash,role) VALUES(?,?,?,?)',
    [name, username, await bcrypt.hash(password, 10), role]);
  res.json({ ok: true });
}));
app.delete('/api/users/:id', auth('admin'), wrap(async (req, res) => {
  if (+req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- Sales ----------
app.post('/api/sales', auth('admin', 'cashier'), wrap(async (req, res) => {
  const { items, customer_username } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Cart is empty' });
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    let customerId = null;
    if (customer_username) {
      const [u] = await c.query("SELECT id FROM users WHERE username=? AND role='customer'", [customer_username]);
      if (!u.length) throw new Error('Customer username not found');
      customerId = u[0].id;
    }
    let total = 0; const rows = [];
    for (const it of items) {
      const [m] = await c.query('SELECT * FROM medicines WHERE id=? FOR UPDATE', [it.medicine_id]);
      if (!m.length || m[0].stock < it.qty) throw new Error('Insufficient stock: ' + (m[0]?.name || 'item'));
      total += m[0].price * it.qty; rows.push([m[0].id, it.qty, m[0].price]);
    }
    const [s] = await c.query('INSERT INTO sales(cashier_id,customer_id,total) VALUES(?,?,?)', [req.user.id, customerId, total]);
    for (const r of rows) {
      await c.query('INSERT INTO sale_items(sale_id,medicine_id,qty,price) VALUES(?,?,?,?)', [s.insertId, ...r]);
      await c.query('UPDATE medicines SET stock=stock-? WHERE id=?', [r[1], r[0]]);
    }
    await c.commit();
    res.json({ id: s.insertId, total });
  } catch (e) { await c.rollback(); res.status(400).json({ error: e.message }); }
  finally { c.release(); }
}));

app.get('/api/sales', auth(), wrap(async (req, res) => {
  const own = req.user.role === 'customer';
  if (req.user.role === 'pharmacist') return res.status(403).json({ error: 'Access denied for your role' });
  const [r] = await pool.query(
    `SELECT s.id, s.total, s.created_at, MAX(c.username) customer, MAX(k.name) cashier,
            GROUP_CONCAT(CONCAT(m.name,' x',si.qty) SEPARATOR ', ') items
     FROM sales s LEFT JOIN users c ON c.id=s.customer_id JOIN users k ON k.id=s.cashier_id
     JOIN sale_items si ON si.sale_id=s.id JOIN medicines m ON m.id=si.medicine_id
     ${own ? 'WHERE s.customer_id=?' : ''} GROUP BY s.id ORDER BY s.id DESC`, own ? [req.user.id] : []);
  res.json(r);
}));

app.get('/api/stats', auth('admin'), wrap(async (_q, res) => {
  const q = async s => (await pool.query(s))[0][0].v;
  res.json({
    medicines: await q('SELECT COUNT(*) v FROM medicines'),
    lowStock: await q('SELECT COUNT(*) v FROM medicines WHERE stock<20'),
    users: await q('SELECT COUNT(*) v FROM users'),
    sales: await q('SELECT COUNT(*) v FROM sales'),
    revenue: await q('SELECT COALESCE(SUM(total),0) v FROM sales')
  });
}));

// ---------- Seed default staff logins ----------
async function seed() {
  const defaults = [
    ['Administrator', 'admin', 'admin123', 'admin'],
    ['Pharmacist', 'pharmacist', 'pharma123', 'pharmacist'],
    ['Cashier', 'cashier', 'cash123', 'cashier']
  ];
  for (const [name, username, pw, role] of defaults) {
    const [e] = await pool.query('SELECT id FROM users WHERE username=?', [username]);
    if (!e.length) await pool.query('INSERT INTO users(name,username,password_hash,role) VALUES(?,?,?,?)',
      [name, username, await bcrypt.hash(pw, 10), role]);
  }
}
seed().then(() => app.listen(process.env.PORT || 5000, () => console.log('API running on http://localhost:' + (process.env.PORT || 5000))))
  .catch(e => { console.error('DB connection failed. Check backend/.env and run database/schema.sql first.\n', e.message); process.exit(1); });
