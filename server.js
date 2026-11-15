const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const dbPath = path.join(__dirname, 'caja.db');
const backupPath = path.join(__dirname, 'caja_backup.db');

if (fs.existsSync(dbPath)) {
  try {
    fs.copyFileSync(dbPath, backupPath);
  } catch (err) {
    console.warn('No se pudo crear el backup inicial:', err.message);
  }
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Inicialización de tablas SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS tanques (
    id INTEGER PRIMARY KEY,
    combustible TEXT UNIQUE NOT NULL,
    litros_disponibles REAL NOT NULL DEFAULT 0,
    precio_litro REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS cierres_caja (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    litros_super REAL NOT NULL DEFAULT 0,
    valor_super REAL NOT NULL DEFAULT 0,
    litros_euro REAL NOT NULL DEFAULT 0,
    valor_euro REAL NOT NULL DEFAULT 0,
    litros_gasoil REAL NOT NULL DEFAULT 0,
    valor_gasoil REAL NOT NULL DEFAULT 0,
    total_venta REAL NOT NULL DEFAULT 0,
    efectivo REAL NOT NULL DEFAULT 0,
    policia REAL NOT NULL DEFAULT 0,
    comuna REAL NOT NULL DEFAULT 0,
    bomberos REAL NOT NULL DEFAULT 0,
    transferencia REAL NOT NULL DEFAULT 0,
    otro REAL NOT NULL DEFAULT 0,
    medios_extra TEXT NOT NULL DEFAULT '[]',
    total_normalizado REAL NOT NULL DEFAULT 0
  );
`);

// Migraciones automáticas sin perder datos existentes
const columnasCierres = db.prepare("PRAGMA table_info(cierres_caja)").all().map(c => c.name);
if (!columnasCierres.includes('medios_extra')) {
  db.exec("ALTER TABLE cierres_caja ADD COLUMN medios_extra TEXT NOT NULL DEFAULT '[]'");
}
if (!columnasCierres.includes('comuna')) {
  db.exec("ALTER TABLE cierres_caja ADD COLUMN comuna REAL NOT NULL DEFAULT 0");
}
if (!columnasCierres.includes('bomberos')) {
  db.exec("ALTER TABLE cierres_caja ADD COLUMN bomberos REAL NOT NULL DEFAULT 0");
}

const insertTanque = db.prepare('INSERT OR IGNORE INTO tanques (id, combustible, litros_disponibles, precio_litro) VALUES (?, ?, ?, ?)');
insertTanque.run(1, 'Super', 10000, 1150);
insertTanque.run(2, 'Euro', 10000, 1380);
insertTanque.run(3, 'Gasoil', 15000, 1200);

// 2. Endpoints API

app.get('/api/tanques', (req, res) => {
  const tanques = db.prepare('SELECT * FROM tanques ORDER BY id').all();
  res.json(tanques);
});

app.post('/api/tanques/precios', (req, res) => {
  const { Super, Euro, Gasoil } = req.body;
  const updatePrecio = db.prepare('UPDATE tanques SET precio_litro = ? WHERE combustible = ?');
  const tx = db.transaction(() => {
    if (Number(Super) > 0) updatePrecio.run(Number(Super), 'Super');
    if (Number(Euro) > 0) updatePrecio.run(Number(Euro), 'Euro');
    if (Number(Gasoil) > 0) updatePrecio.run(Number(Gasoil), 'Gasoil');
  });
  tx();
  res.json({ ok: true, tanques: db.prepare('SELECT * FROM tanques ORDER BY id').all() });
});

app.post('/api/tanques/ajustar', (req, res) => {
  const { combustible, operacion, litros } = req.body;
  const cantidad = Number(litros);

  if (!combustible || isNaN(cantidad) || cantidad < 0) {
    return res.status(400).json({ error: 'Cantidad de litros inválida.' });
  }

  const tanque = db.prepare('SELECT litros_disponibles FROM tanques WHERE combustible = ?').get(combustible);
  if (!tanque) return res.status(404).json({ error: 'Combustible no encontrado.' });

  let nuevoStock = tanque.litros_disponibles;
  if (operacion === 'agregar') nuevoStock += cantidad;
  else if (operacion === 'restar') nuevoStock = Math.max(0, nuevoStock - cantidad);
  else if (operacion === 'modificar') nuevoStock = cantidad;
  else return res.status(400).json({ error: 'Operación no válida.' });

  db.prepare('UPDATE tanques SET litros_disponibles = ? WHERE combustible = ?').run(Number(nuevoStock.toFixed(2)), combustible);
  res.json({ ok: true, tanques: db.prepare('SELECT * FROM tanques ORDER BY id').all() });
});

app.post('/api/cierres', (req, res) => {
  const d = req.body;
  const comuna = Number(d.comuna || 0);
  const bomberos = Number(d.bomberos || 0);

  const camposNumericos = [
    d.litros_super, d.valor_super, d.litros_euro, d.valor_euro,
    d.litros_gasoil, d.valor_gasoil, d.total_venta,
    d.efectivo, d.policia, comuna, bomberos, d.transferencia, d.otro, d.total_normalizado
  ];
  if (camposNumericos.some(n => typeof n !== 'number' || isNaN(n) || n < 0)) {
    return res.status(400).json({ error: 'No se permiten valores negativos ni inválidos.' });
  }

  const guardarCierreTx = db.transaction((datos) => {
    const tanques = db.prepare('SELECT combustible, litros_disponibles FROM tanques').all();
    const stockMap = Object.fromEntries(tanques.map(t => [t.combustible, t.litros_disponibles]));

    if (datos.litros_super > stockMap['Super'] ||
        datos.litros_euro > stockMap['Euro'] ||
        datos.litros_gasoil > stockMap['Gasoil']) {
      throw new Error('Stock insuficiente en uno de los tanques para descontar los litros vendidos.');
    }

    const insert = db.prepare(`
      INSERT INTO cierres_caja (
        fecha, litros_super, valor_super, litros_euro, valor_euro,
        litros_gasoil, valor_gasoil, total_venta, efectivo, policia,
        comuna, bomberos, transferencia, otro, medios_extra, total_normalizado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = insert.run(
      datos.fecha,
      datos.litros_super, datos.valor_super,
      datos.litros_euro, datos.valor_euro,
      datos.litros_gasoil, datos.valor_gasoil,
      datos.total_venta,
      datos.efectivo, datos.policia, comuna, bomberos, datos.transferencia, datos.otro,
      JSON.stringify(datos.medios_extra || []),
      datos.total_normalizado
    );

    const updateTanque = db.prepare('UPDATE tanques SET litros_disponibles = ROUND(litros_disponibles - ?, 2) WHERE combustible = ?');
    updateTanque.run(datos.litros_super, 'Super');
    updateTanque.run(datos.litros_euro, 'Euro');
    updateTanque.run(datos.litros_gasoil, 'Gasoil');

    return info.lastInsertRowid;
  });

  try {
    const idCierre = guardarCierreTx(d);
    const tanquesActualizados = db.prepare('SELECT * FROM tanques ORDER BY id').all();
    res.json({ ok: true, id: idCierre, tanques: tanquesActualizados });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Anular cierre (soporta tanto DELETE como POST)
const handlerAnularCierre = (req, res) => {
  const idCierre = Number(req.params.id);

  const anularTx = db.transaction((id) => {
    const cierre = db.prepare('SELECT * FROM cierres_caja WHERE id = ?').get(id);
    if (!cierre) throw new Error('El cierre indicado no existe.');

    const devolverTanque = db.prepare('UPDATE tanques SET litros_disponibles = ROUND(litros_disponibles + ?, 2) WHERE combustible = ?');
    devolverTanque.run(cierre.litros_super, 'Super');
    devolverTanque.run(cierre.litros_euro, 'Euro');
    devolverTanque.run(cierre.litros_gasoil, 'Gasoil');

    db.prepare('DELETE FROM cierres_caja WHERE id = ?').run(id);
  });

  try {
    anularTx(idCierre);
    res.json({ ok: true, tanques: db.prepare('SELECT * FROM tanques ORDER BY id').all() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

app.delete('/api/cierres/:id', handlerAnularCierre);
app.post('/api/cierres/:id/anular', handlerAnularCierre);

app.get('/api/cierres/ultimos-7-dias', (req, res) => {
  const fechas = db.prepare(`
    SELECT DISTINCT fecha FROM cierres_caja 
    ORDER BY fecha DESC 
    LIMIT 7
  `).all().map(r => r.fecha);

  if (fechas.length === 0) return res.json([]);

  const placeholders = fechas.map(() => '?').join(',');
  const cierres = db.prepare(`
    SELECT * FROM cierres_caja 
    WHERE fecha IN (${placeholders}) 
    ORDER BY fecha DESC, id DESC
  `).all(...fechas);

  res.json(cierres.map(c => ({
    ...c,
    comuna: c.comuna || 0,
    bomberos: c.bomberos || 0,
    medios_extra: JSON.parse(c.medios_extra || '[]')
  })));
});

app.get('/api/informes/:mes', (req, res) => {
  const { mes } = req.params;
  const cierresRaw = db.prepare(`
    SELECT * FROM cierres_caja 
    WHERE fecha LIKE ? 
    ORDER BY fecha ASC, id ASC
  `).all(`${mes}%`);

  const cierres = cierresRaw.map(c => ({
    ...c,
    comuna: c.comuna || 0,
    bomberos: c.bomberos || 0,
    medios_extra: JSON.parse(c.medios_extra || '[]')
  }));

  const resumen = cierres.reduce((acc, c) => {
    acc.litros_super += c.litros_super;
    acc.valor_super += c.valor_super;
    acc.litros_euro += c.litros_euro;
    acc.valor_euro += c.valor_euro;
    acc.litros_gasoil += c.litros_gasoil;
    acc.valor_gasoil += c.valor_gasoil;
    acc.total_venta += c.total_venta;
    acc.efectivo += c.efectivo;
    acc.policia += c.policia;
    acc.comuna += c.comuna;
    acc.bomberos += c.bomberos;
    acc.transferencia += c.transferencia;
    acc.otro += c.otro;
    acc.total_normalizado += c.total_normalizado;
    return acc;
  }, {
    cantidad_cierres: cierres.length,
    litros_super: 0, valor_super: 0,
    litros_euro: 0, valor_euro: 0,
    litros_gasoil: 0, valor_gasoil: 0,
    total_venta: 0,
    efectivo: 0, policia: 0, comuna: 0, bomberos: 0,
    transferencia: 0, otro: 0, total_normalizado: 0
  });

  res.json({ mes, resumen, cierres });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Sistema de Caja corriendo localmente en http://localhost:${PORT}`);
});