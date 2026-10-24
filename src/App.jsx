import React, { useState, useEffect } from 'react';

const api = async (path, method = 'GET', body) => {
  const t = localStorage.getItem('token');
  const r = await fetch('/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) },
    body: body && JSON.stringify(body)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
};

function Login({ onLogin }) {
  const [reg, setReg] = useState(false);
  const [f, setF] = useState({ name: '', username: '', password: '' });
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setErr(''); setMsg('');
    try {
      if (reg) { await api('/register', 'POST', f); setMsg('Registered! Please login.'); setReg(false); }
      else { const d = await api('/login', 'POST', f); localStorage.setItem('token', d.token); onLogin(d.user); }
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="card login">
      <h1>💊 PharmaCare</h1>
      <h3>{reg ? 'Customer Registration' : 'Login'}</h3>
      {reg && <input placeholder="Full name" value={f.name} onChange={set('name')} />}
      <input placeholder="Username" value={f.username} onChange={set('username')} />
      <input type="password" placeholder="Password" value={f.password} onChange={set('password')} />
      {err && <div className="err">{err}</div>}{msg && <div className="ok">{msg}</div>}
      <p><button className="btn" onClick={submit}>{reg ? 'Register' : 'Login'}</button></p>
      <p className="hint">{reg ? 'Already registered?' : 'New customer?'}{' '}
        <span className="link" onClick={() => setReg(!reg)}>{reg ? 'Login' : 'Register here'}</span></p>
      {!reg && <p className="hint">Staff demo: admin/admin123 · pharmacist/pharma123 · cashier/cash123</p>}
    </div>
  );
}

function Dashboard() {
  const [s, setS] = useState({});
  useEffect(() => { api('/stats').then(setS); }, []);
  const items = [['Medicines', s.medicines], ['Low stock (<20)', s.lowStock], ['Users', s.users], ['Sales', s.sales], ['Revenue', '₹' + Number(s.revenue || 0).toFixed(2)]];
  return <div className="stats">{items.map(([k, v]) => <div className="stat" key={k}>{k}<b>{v ?? '-'}</b></div>)}</div>;
}

function Medicines({ role }) {
  const canEdit = ['admin', 'pharmacist'].includes(role);
  const empty = { name: '', category: '', price: '', stock: '', expiry_date: '' };
  const [list, setList] = useState([]); const [f, setF] = useState(empty); const [edit, setEdit] = useState(null); const [err, setErr] = useState('');
  const load = () => api('/medicines').then(setList);
  useEffect(() => { load(); }, []);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr('');
    try { edit ? await api('/medicines/' + edit, 'PUT', f) : await api('/medicines', 'POST', f); setF(empty); setEdit(null); load(); }
    catch (e) { setErr(e.message); }
  };
  const del = async id => { try { await api('/medicines/' + id, 'DELETE'); load(); } catch (e) { setErr(e.message); } };
  return (
    <div className="card">
      <h3>Medicines</h3>
      {canEdit && <div>
        <input placeholder="Name" value={f.name} onChange={set('name')} />
        <input placeholder="Category" value={f.category} onChange={set('category')} />
        <input type="number" placeholder="Price" value={f.price} onChange={set('price')} style={{ width: 90 }} />
        <input type="number" placeholder="Stock" value={f.stock} onChange={set('stock')} style={{ width: 90 }} />
        <input type="date" value={f.expiry_date?.slice(0, 10)} onChange={set('expiry_date')} />
        <button className="btn" onClick={save}>{edit ? 'Update' : 'Add'}</button>
        {edit && <button className="btn red" onClick={() => { setEdit(null); setF(empty); }}>Cancel</button>}
      </div>}
      {err && <div className="err">{err}</div>}
      <table><thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Expiry</th>{canEdit && <th></th>}</tr></thead>
        <tbody>{list.map(m => (
          <tr key={m.id}><td>{m.name}</td><td>{m.category}</td><td>₹{m.price}</td>
            <td className={m.stock < 20 ? 'low' : ''}>{m.stock}</td><td>{m.expiry_date?.slice(0, 10)}</td>
            {canEdit && <td>
              <button className="btn sm" onClick={() => { setEdit(m.id); setF({ ...m, expiry_date: m.expiry_date?.slice(0, 10) || '' }); }}>Edit</button>
              {role === 'admin' && <button className="btn red sm" onClick={() => del(m.id)}>Delete</button>}
            </td>}
          </tr>))}</tbody></table>
    </div>
  );
}

function Users() {
  const [list, setList] = useState([]); const [err, setErr] = useState('');
  const [f, setF] = useState({ name: '', username: '', password: '', role: 'pharmacist' });
  const load = () => api('/users').then(setList);
  useEffect(() => { load(); }, []);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const add = async () => { try { await api('/users', 'POST', f); setF({ ...f, name: '', username: '', password: '' }); setErr(''); load(); } catch (e) { setErr(e.message); } };
  const del = async id => { try { await api('/users/' + id, 'DELETE'); load(); } catch (e) { setErr(e.message); } };
  return (
    <div className="card">
      <h3>User Management</h3>
      <input placeholder="Name" value={f.name} onChange={set('name')} />
      <input placeholder="Username" value={f.username} onChange={set('username')} />
      <input type="password" placeholder="Password" value={f.password} onChange={set('password')} />
      <select value={f.role} onChange={set('role')}>{['admin', 'pharmacist', 'cashier', 'customer'].map(r => <option key={r}>{r}</option>)}</select>
      <button className="btn" onClick={add}>Add user</button>
      {err && <div className="err">{err}</div>}
      <table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th></th></tr></thead>
        <tbody>{list.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.username}</td><td>{u.role}</td>
          <td><button className="btn red sm" onClick={() => del(u.id)}>Delete</button></td></tr>)}</tbody></table>
    </div>
  );
}

function NewSale() {
  const [meds, setMeds] = useState([]); const [cart, setCart] = useState([]);
  const [sel, setSel] = useState(''); const [qty, setQty] = useState(1); const [cust, setCust] = useState('');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const load = () => api('/medicines').then(setMeds);
  useEffect(() => { load(); }, []);
  const add = () => {
    const m = meds.find(x => x.id === +sel); if (!m) return;
    setCart([...cart, { medicine_id: m.id, name: m.name, price: m.price, qty: +qty }]);
  };
  const total = cart.reduce((a, c) => a + c.price * c.qty, 0);
  const checkout = async () => {
    setErr(''); setMsg('');
    try { const d = await api('/sales', 'POST', { items: cart, customer_username: cust || null }); setMsg(`Sale #${d.id} completed. Total ₹${d.total}`); setCart([]); setCust(''); load(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div className="card">
      <h3>New Sale</h3>
      <select value={sel} onChange={e => setSel(e.target.value)}>
        <option value="">Select medicine</option>
        {meds.map(m => <option key={m.id} value={m.id}>{m.name} (stock {m.stock}) ₹{m.price}</option>)}
      </select>
      <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={{ width: 70 }} />
      <button className="btn" onClick={add}>Add to cart</button>
      <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
        <tbody>{cart.map((c, i) => <tr key={i}><td>{c.name}</td><td>{c.qty}</td><td>₹{c.price}</td><td>₹{(c.price * c.qty).toFixed(2)}</td></tr>)}</tbody></table>
      <h3>Total: ₹{total.toFixed(2)}</h3>
      <input placeholder="Customer username (optional)" value={cust} onChange={e => setCust(e.target.value)} />
      <button className="btn" onClick={checkout} disabled={!cart.length}>Complete sale</button>
      {err && <div className="err">{err}</div>}{msg && <div className="ok">{msg}</div>}
    </div>
  );
}

function Sales({ role }) {
  const [list, setList] = useState([]);
  useEffect(() => { api('/sales').then(setList); }, []);
  return (
    <div className="card">
      <h3>{role === 'customer' ? 'My Orders' : 'Sales History'}</h3>
      <table><thead><tr><th>#</th><th>Date</th><th>Items</th><th>Customer</th><th>Cashier</th><th>Total</th></tr></thead>
        <tbody>{list.map(s => <tr key={s.id}><td>{s.id}</td><td>{new Date(s.created_at).toLocaleString()}</td>
          <td>{s.items}</td><td>{s.customer || '-'}</td><td>{s.cashier}</td><td>₹{s.total}</td></tr>)}</tbody></table>
    </div>
  );
}

const TABS = {
  admin: ['Dashboard', 'Medicines', 'Users', 'Sales', 'New Sale'],
  pharmacist: ['Medicines'],
  cashier: ['New Sale', 'Sales', 'Medicines'],
  customer: ['Medicines', 'My Orders']
};

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [tab, setTab] = useState(null);
  const login = u => { localStorage.setItem('user', JSON.stringify(u)); setUser(u); setTab(TABS[u.role][0]); };
  const logout = () => { localStorage.clear(); setUser(null); setTab(null); };
  if (!user) return <Login onLogin={login} />;
  const cur = tab || TABS[user.role][0];
  return (
    <>
      <div className="nav">
        <h2>💊 PharmaCare</h2>
        {TABS[user.role].map(t => <button key={t} className={cur === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
        <span>{user.name} ({user.role})</span><button onClick={logout}>Logout</button>
      </div>
      <div className="wrap">
        {cur === 'Dashboard' && <Dashboard />}
        {cur === 'Medicines' && <Medicines role={user.role} />}
        {cur === 'Users' && <Users />}
        {cur === 'New Sale' && <NewSale />}
        {(cur === 'Sales' || cur === 'My Orders') && <Sales role={user.role} />}
      </div>
    </>
  );
}
