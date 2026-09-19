import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
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

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const sign = (u) =>
  jwt.sign({ sub: String(u.id), rol: u.rol, correo: u.correo, propietario_id: u.propietario_id || null }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });

app.get("/", (_q, r) => {
  r.json({
    service: "auth-service",
    status: "ok",
    message: "Servicio de autenticación activo",
    endpoints: {
      health: "/health",
      login: "POST /api/auth/login",
      profile: "GET /api/auth/profile",
      register: "POST /api/auth/register",
    },
  });
});

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  try {
    const token = h.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Token ausente");
    req.user = jwt.verify(token, secret);
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido o ausente" });
  }
}

function admin(req, res, next) {
  return req.user?.rol === "SUPER_USUARIO" || req.user?.rol === "ADMIN"
    ? next()
    : res.status(403).json({ error: "Requiere rol SUPER_USUARIO" });
}

app.get("/health", asyncRoute(async (_q, r) => {
  await pool.query("SELECT 1");
  r.json({ service: "auth-service", status: "ok" });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password) {
    return res.status(400).json({ error: "Correo y password son obligatorios" });
  }

  const q = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.password_hash, u.propietario_id, r.nombre rol
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE LOWER(u.correo) = LOWER($1) AND u.activo`,
    [correo],
  );

  const u = q.rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  return res.json({
    token: sign(u),
    usuario: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, propietario_id: u.propietario_id },
  });
}));

app.post("/api/auth/register-public", asyncRoute(async (req, res) => {
  const { nombre, correo, password, numero_orden, servicio } = req.body;

  if (!nombre || !correo || !password || password.length < 8 || !numero_orden || !servicio) {
    return res.status(400).json({
      error: "Nombre, correo, password, número de orden y servicio son obligatorios",
    });
  }

  const hash = await bcrypt.hash(password, 12);
  const q = await pool.query(
    `WITH orden_validada AS (
       SELECT v.propietario_id
       FROM ordenes_servicio os
       JOIN vehiculos v ON v.id = os.vehiculo_id
       JOIN servicios s ON s.id = os.servicio_id
       WHERE os.id = NULLIF(REGEXP_REPLACE(UPPER($4), '[^0-9]', '', 'g'), '')::BIGINT
         AND (LOWER(TRIM(s.nombre)) = LOWER(TRIM($5)) OR s.id::text = TRIM($5))
     )
     INSERT INTO usuarios(rol_id, propietario_id, nombre, correo, password_hash)
     SELECT r.id, o.propietario_id, $1, LOWER($2), $3
     FROM roles r CROSS JOIN orden_validada o
     WHERE r.nombre = 'CLIENTE'
     RETURNING id, nombre, correo, propietario_id`,
    [nombre, correo, hash, numero_orden, servicio],
  );

  if (!q.rowCount) return res.status(400).json({ error: "El número de orden y servicio no coinciden" });
  return res.status(201).json({ ...q.rows[0], rol: "CLIENTE" });
}));

app.get("/api/auth/profile", auth, asyncRoute(async (req, res) => {
  const q = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.propietario_id, r.nombre rol
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [req.user.sub],
  );

  if (!q.rowCount) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  return res.json(q.rows[0]);
}));

app.get("/api/auth/users", auth, admin, asyncRoute(async (_req, res) => {
  const q = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.propietario_id, u.activo, u.creado_en, r.nombre rol
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     ORDER BY u.id DESC`,
  );
  return res.json(q.rows);
}));

app.post("/api/auth/register", auth, admin, asyncRoute(async (req, res) => {
  const { nombre, correo, password, rol = "RECEPCIONISTA" } = req.body;

  if (!nombre || !correo || !password || password.length < 8 || !["RECEPCIONISTA", "ENCARGADO", "SUPER_USUARIO", "CLIENTE"].includes(rol)) {
    return res.status(400).json({
      error: "Nombre, correo y password de al menos 8 caracteres son obligatorios",
    });
  }

  const hash = await bcrypt.hash(password, 12);
  const q = await pool.query(
    `INSERT INTO usuarios(rol_id, nombre, correo, password_hash)
     SELECT id, $1, LOWER($2), $3
     FROM roles
     WHERE nombre = $4
     RETURNING id, nombre, correo`,
    [nombre, correo, hash, rol],
  );

  if (!q.rowCount) {
    return res.status(400).json({ error: "Rol inválido" });
  }

  return res.status(201).json({ ...q.rows[0], rol });
}));

app.use((err, _q, res, _n) => {
  console.error(err);
  if (err.code === "23505") {
    return res.status(409).json({ error: "El registro ya existe" });
  }
  return res.status(500).json({ error: "Error interno" });
});

app.listen(process.env.PORT || 3001, () => console.log("auth-service listo"));

