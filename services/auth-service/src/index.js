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

const permissionModules = ["propietarios", "vehiculos", "servicios", "ordenes", "usuarios"];
const permissionActions = ["consultar", "crear", "editar", "eliminar"];
const fullPermissions = Object.fromEntries(permissionModules.map((module) => [module, Object.fromEntries(permissionActions.map((action) => [action, true]))]));
const defaultPermissions = {
  RECEPCIONISTA: { propietarios: { consultar: true }, vehiculos: { consultar: true }, servicios: { consultar: true }, ordenes: { consultar: true, crear: true } },
  ENCARGADO: { propietarios: { consultar: true, crear: true, editar: true }, vehiculos: { consultar: true, crear: true, editar: true }, servicios: { consultar: true, crear: true, editar: true }, ordenes: { consultar: true, crear: true, editar: true } },
  ADMIN: fullPermissions,
  SUPER_USUARIO: fullPermissions,
  CLIENTE: { ordenes: { consultar: true } },
};

function normalizePermissions(role, permissions) {
  const base = permissions && typeof permissions === "object" ? permissions : defaultPermissions[role] || {};
  return Object.fromEntries(permissionModules.map((module) => [module, Object.fromEntries(permissionActions.map((action) => [action, base[module]?.[action] === true]))]));
}

const sign = (u) =>
  jwt.sign({ sub: String(u.id), rol: u.rol, correo: u.correo, propietario_id: u.propietario_id || null, permisos: normalizePermissions(u.rol, u.permisos) }, secret, {
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
    `SELECT u.id, u.nombre, u.correo, u.password_hash, u.propietario_id, u.permisos, r.nombre rol
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
    usuario: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, propietario_id: u.propietario_id, permisos: normalizePermissions(u.rol, u.permisos) },
  });
}));

app.get("/api/auth/profile", auth, asyncRoute(async (req, res) => {
  const q = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.propietario_id, u.permisos, r.nombre rol
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [req.user.sub],
  );

  if (!q.rowCount) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  return res.json({ ...q.rows[0], permisos: normalizePermissions(q.rows[0].rol, q.rows[0].permisos) });
}));

app.get("/api/auth/users", auth, admin, asyncRoute(async (_req, res) => {
  const q = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.propietario_id, u.permisos, u.activo, u.creado_en, r.nombre rol
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     ORDER BY u.id DESC`,
  );
  return res.json(q.rows);
}));

app.post("/api/auth/register", auth, admin, asyncRoute(async (req, res) => {
  const { nombre, correo, password, rol = "RECEPCIONISTA", permisos } = req.body;

  if (!nombre || !correo || !password || password.length < 8 || !["RECEPCIONISTA", "ENCARGADO", "ADMIN", "SUPER_USUARIO", "CLIENTE"].includes(rol)) {
    return res.status(400).json({
      error: "Nombre, correo y password de al menos 8 caracteres son obligatorios",
    });
  }

  const hash = await bcrypt.hash(password, 12);
  const q = await pool.query(
    `INSERT INTO usuarios(rol_id, nombre, correo, password_hash, permisos)
     SELECT id, $1, LOWER($2), $3, $5::jsonb
     FROM roles
     WHERE nombre = $4
     RETURNING id, nombre, correo`,
    [nombre, correo, hash, rol, JSON.stringify(normalizePermissions(rol, permisos))],
  );

  if (!q.rowCount) {
    return res.status(400).json({ error: "Rol inválido" });
  }

  return res.status(201).json({ ...q.rows[0], rol });
}));

app.put("/api/auth/users/:id", auth, admin, asyncRoute(async (req, res) => {
  const { nombre, correo, password, rol, activo = true, permisos } = req.body;
  const validRoles = ["RECEPCIONISTA", "ENCARGADO", "ADMIN", "SUPER_USUARIO", "CLIENTE"];
  if (!nombre || !correo || !validRoles.includes(rol)) {
    return res.status(400).json({ error: "Nombre, correo y rol válido son obligatorios" });
  }
  if (String(req.user.sub) === String(req.params.id) && !activo) {
    return res.status(400).json({ error: "No puede desactivar su propio usuario" });
  }

  const passwordHash = password ? await bcrypt.hash(password, 12) : null;
  const q = await pool.query(
    `UPDATE usuarios u
     SET nombre = $1,
         correo = LOWER($2),
         rol_id = (SELECT id FROM roles WHERE nombre = $3),
         activo = $4,
         password_hash = COALESCE($5, u.password_hash),
         permisos = $6::jsonb,
         actualizado_en = NOW()
    WHERE u.id = $7
     RETURNING u.id, u.nombre, u.correo, u.activo, u.propietario_id,
       (SELECT nombre FROM roles WHERE id = u.rol_id) rol`,
     [nombre, correo, rol, !!activo, passwordHash, JSON.stringify(normalizePermissions(rol, permisos)), req.params.id],
  );
  if (!q.rowCount) return res.status(404).json({ error: "Usuario no encontrado" });
  return res.json(q.rows[0]);
}));

app.delete("/api/auth/users/:id", auth, admin, asyncRoute(async (req, res) => {
  if (String(req.user.sub) === String(req.params.id)) {
    return res.status(400).json({ error: "No puede eliminar su propio usuario" });
  }
  const result = await pool.query("DELETE FROM usuarios WHERE id = $1 RETURNING id", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Usuario no encontrado" });
  return res.json({ id: result.rows[0].id, eliminado: true });
}));

app.use((err, _q, res, _n) => {
  console.error(err);
  if (err.code === "23505") {
    return res.status(409).json({ error: "El registro ya existe" });
  }
  return res.status(500).json({ error: "Error interno" });
});

app.listen(process.env.PORT || 3001, () => console.log("auth-service listo"));

