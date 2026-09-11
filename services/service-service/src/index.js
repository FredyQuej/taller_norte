import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const { Pool } = pg;
dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

app.use(cors());
app.use(helmet());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    req.user = decoded;
    next();
  });
};

const parseServicePayload = (body) => ({
  nombre: body.nombre,
  descripcion: body.descripcion || '',
  precio: body.precio !== undefined && body.precio !== null ? Number(body.precio) : 0,
  activo: body.activo !== undefined ? !!body.activo : true,
});

app.get('/', (_req, res) => {
  res.json({
    service: 'service-service',
    status: 'ok',
    message: 'Servicio de servicios activo',
    endpoints: {
      health: '/health',
      servicios: '/api/servicios',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'service-service' });
});

app.get('/api/servicios', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM servicios ORDER BY id ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching servicios:', error);
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

app.get('/api/servicios/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('SELECT * FROM servicios WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching servicio:', error);
    res.status(500).json({ error: 'Error al obtener servicio' });
  }
});

app.post('/api/servicios', authenticateToken, async (req, res) => {
  const payload = parseServicePayload(req.body);

  try {
    const result = await pool.query(
      `INSERT INTO servicios (nombre, descripcion, precio, activo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [payload.nombre, payload.descripcion, payload.precio, payload.activo]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating servicio:', error);
    res.status(500).json({ error: 'Error al crear servicio' });
  }
});

app.put('/api/servicios/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const payload = parseServicePayload(req.body);

  try {
    const result = await pool.query(
      `UPDATE servicios
       SET nombre = $1, descripcion = $2, precio = $3, activo = $4, actualizado_en = NOW()
       WHERE id = $5
       RETURNING *`,
      [payload.nombre, payload.descripcion, payload.precio, payload.activo, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating servicio:', error);
    res.status(500).json({ error: 'Error al actualizar servicio' });
  }
});

app.listen(port, () => {
  console.log(`service-service running on port ${port}`);
});
