import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import pg from "pg";

const app = express();
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || "postgresql://mantenimiento:mantenimiento123@localhost:5432/control_mantenimiento",
});
const secret = process.env.JWT_SECRET || "clave_desarrollo_no_usar_en_produccion";

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "100kb" }));

const ar = (fn) => (q, s, n) => Promise.resolve(fn(q, s, n)).catch(n);

app.get("/", (_q, s) => {
  s.json({
    service: "vehicle-service",
    status: "ok",
    message: "Servicio de propietarios y vehículos activo",
    endpoints: {
      health: "/health",
      propietarios: "/api/propietarios",
      vehiculos: "/api/vehiculos",
    },
  });
});

function auth(q, s, n) {
  try {
    const token = (q.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Token ausente");
    q.user = jwt.verify(token, secret);
    return n();
  } catch {
    return s.status(401).json({ error: "Token inválido o ausente" });
  }
}

app.get("/health", ar(async (_q, s) => {
  await pool.query("SELECT 1");
  s.json({ service: "vehicle-service", status: "ok" });
}));

app.use("/api", auth);

app.get("/api/propietarios", ar(async (q, s) => {
  const x = await pool.query(
    `SELECT *
     FROM propietarios
     WHERE ($1::text IS NULL OR nombre ILIKE '%' || $1 || '%')
     ORDER BY id DESC`,
    [q.query.buscar || null],
  );
  s.json(x.rows);
}));

app.post("/api/propietarios", ar(async (q, s) => {
  const { tipo, nombre, telefono = null, correo = null, direccion = null } = q.body;

  if (!['INDIVIDUAL', 'EMPRESA'].includes(tipo) || !nombre || (!telefono && !correo)) {
    return s.status(400).json({ error: "Tipo, nombre y al menos un contacto son obligatorios" });
  }

  const x = await pool.query(
    `INSERT INTO propietarios(tipo, nombre, telefono, correo, direccion)
     VALUES($1, $2, $3, $4, $5)
     RETURNING *`,
    [tipo, nombre, telefono, correo, direccion],
  );

  return s.status(201).json(x.rows[0]);
}));

app.get("/api/propietarios/:id", ar(async (q, s) => {
  const x = await pool.query("SELECT * FROM propietarios WHERE id = $1", [q.params.id]);
  if (!x.rowCount) {
    return s.status(404).json({ error: "Propietario no encontrado" });
  }
  return s.json(x.rows[0]);
}));

app.put("/api/propietarios/:id", ar(async (q, s) => {
  const { tipo, nombre, telefono = null, correo = null, direccion = null, activo = true } = q.body;

  if (!['INDIVIDUAL', 'EMPRESA'].includes(tipo) || !nombre || (!telefono && !correo)) {
    return s.status(400).json({ error: "Datos inválidos" });
  }

  const x = await pool.query(
    `UPDATE propietarios
     SET tipo = $1,
         nombre = $2,
         telefono = $3,
         correo = $4,
         direccion = $5,
         activo = $6,
         actualizado_en = NOW()
     WHERE id = $7
     RETURNING *`,
    [tipo, nombre, telefono, correo, direccion, activo, q.params.id],
  );

  if (!x.rowCount) {
    return s.status(404).json({ error: "Propietario no encontrado" });
  }

  return s.json(x.rows[0]);
}));

app.get("/api/vehiculos", ar(async (q, s) => {
  const x = await pool.query(
    `SELECT v.*, p.nombre propietario
     FROM vehiculos v
     JOIN propietarios p ON p.id = v.propietario_id
     WHERE ($1::text IS NULL OR v.placa ILIKE '%' || $1 || '%' OR p.nombre ILIKE '%' || $1 || '%')
     ORDER BY v.id DESC`,
    [q.query.buscar || null],
  );
  s.json(x.rows);
}));

app.post("/api/vehiculos", ar(async (q, s) => {
  const {
    propietario_id,
    tipo,
    marca,
    modelo,
    anio,
    placa,
    kilometraje_actual = 0,
    estado = "ACTIVO",
    observaciones = null,
  } = q.body;

  if (!propietario_id || !tipo || !marca || !modelo || !anio || !placa) {
    return s.status(400).json({ error: "Faltan campos obligatorios" });
  }

  const x = await pool.query(
    `INSERT INTO vehiculos(propietario_id, tipo, marca, modelo, anio, placa, kilometraje_actual, estado, observaciones)
     VALUES($1, $2, $3, $4, $5, UPPER($6), $7, $8, $9)
     RETURNING *`,
    [propietario_id, tipo, marca, modelo, anio, placa, kilometraje_actual, estado, observaciones],
  );

  return s.status(201).json(x.rows[0]);
}));

app.get("/api/vehiculos/:id", ar(async (q, s) => {
  const x = await pool.query(
    `SELECT v.*, p.nombre propietario
     FROM vehiculos v
     JOIN propietarios p ON p.id = v.propietario_id
     WHERE v.id = $1`,
    [q.params.id],
  );
  if (!x.rowCount) {
    return s.status(404).json({ error: "Vehículo no encontrado" });
  }
  return s.json(x.rows[0]);
}));

app.put("/api/vehiculos/:id", ar(async (q, s) => {
  const current = await pool.query("SELECT * FROM vehiculos WHERE id = $1", [q.params.id]);
  if (!current.rowCount) {
    return s.status(404).json({ error: "Vehículo no encontrado" });
  }

  const c = current.rows[0];
  const n = { ...c, ...q.body };

  if (Number(n.kilometraje_actual) < Number(c.kilometraje_actual)) {
    return s.status(400).json({ error: "El kilometraje no puede disminuir" });
  }

  const x = await pool.query(
    `UPDATE vehiculos
     SET propietario_id = $1,
         tipo = $2,
         marca = $3,
         modelo = $4,
         anio = $5,
         placa = UPPER($6),
         kilometraje_actual = $7,
         estado = $8,
         observaciones = $9,
         actualizado_en = NOW()
     WHERE id = $10
     RETURNING *`,
    [
      n.propietario_id,
      n.tipo,
      n.marca,
      n.modelo,
      n.anio,
      n.placa,
      n.kilometraje_actual,
      n.estado,
      n.observaciones,
      q.params.id,
    ],
  );

  return s.json(x.rows[0]);
}));

app.use((e, _q, s, _n) => {
  console.error(e);
  if (e.code === "23505") {
    return s.status(409).json({ error: "Placa o dato duplicado" });
  }
  if (e.code === "23503") {
    return s.status(400).json({ error: "Referencia relacionada no existe" });
  }
  if (e.code === "23514") {
    return s.status(400).json({ error: "No cumple una regla de validación" });
  }
  return s.status(500).json({ error: "Error interno" });
});

app.listen(process.env.PORT || 3002, () => console.log("vehicle-service listo"));

