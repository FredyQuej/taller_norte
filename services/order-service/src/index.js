import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const { Pool } = pg;
dotenv.config();

const app = express();
const port = process.env.PORT || 3004;

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

const parseOrderPayload = (body) => ({
  vehiculo_id: body.vehiculo_id !== undefined && body.vehiculo_id !== null ? Number(body.vehiculo_id) : null,
  servicio_id: body.servicio_id !== undefined && body.servicio_id !== null ? Number(body.servicio_id) : null,
  fecha_ingreso: body.fecha_ingreso || body.fecha_programada || new Date().toISOString().split('T')[0],
  descripcion: body.descripcion || '',
  estado: body.estado || 'PENDIENTE',
  prioridad: body.prioridad || 'MEDIA',
  kilometraje: body.kilometraje !== undefined && body.kilometraje !== null ? Number(body.kilometraje) : 0,
  costo: body.costo !== undefined && body.costo !== null ? Number(body.costo) : 0,
  observaciones: body.observaciones || null,
});

const orderSelect = `
  SELECT os.*, v.placa, v.marca, v.modelo, p.nombre propietario, svc.nombre servicio
  FROM ordenes_servicio os
  JOIN vehiculos v ON v.id = os.vehiculo_id
  JOIN propietarios p ON p.id = v.propietario_id
  JOIN servicios svc ON svc.id = os.servicio_id
`;

app.get('/', (_req, res) => {
  res.json({
    service: 'order-service',
    status: 'ok',
    message: 'Servicio de órdenes activo',
    endpoints: {
      health: '/health',
      ordenes: '/api/ordenes-servicio',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'order-service' });
});

app.get('/api/ordenes-servicio', authenticateToken, async (req, res) => {
  try {
    const searchTerm = req.query.buscar || null;
    const result = await pool.query(
      `${orderSelect}
       WHERE ($1::text IS NULL OR os.descripcion ILIKE '%' || $1 || '%' OR v.placa ILIKE '%' || $1 || '%' OR svc.nombre ILIKE '%' || $1 || '%' OR p.nombre ILIKE '%' || $1 || '%')
       ORDER BY os.id DESC`,
      [searchTerm]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching ordenes_servicio:', error);
    res.status(500).json({ error: 'Error al obtener órdenes de servicio' });
  }
});

app.get('/api/ordenes-servicio/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `${orderSelect} WHERE os.id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Orden de servicio no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching orden:', error);
    res.status(500).json({ error: 'Error al obtener orden de servicio' });
  }
});

app.post('/api/ordenes-servicio', authenticateToken, async (req, res) => {
  const payload = parseOrderPayload(req.body);

  if (!payload.vehiculo_id || !payload.servicio_id || !payload.descripcion || !payload.fecha_ingreso) {
    return res.status(400).json({ error: 'Vehículo, servicio, descripción y fecha son obligatorios' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO ordenes_servicio(vehiculo_id, servicio_id, fecha_ingreso, descripcion, estado, prioridad, kilometraje, costo, observaciones)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        payload.vehiculo_id,
        payload.servicio_id,
        payload.fecha_ingreso,
        payload.descripcion,
        payload.estado,
        payload.prioridad,
        payload.kilometraje,
        payload.costo,
        payload.observaciones,
      ]
    );

    const order = await pool.query(
      `${orderSelect} WHERE os.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(order.rows[0]);
  } catch (error) {
    console.error('Error creating orden:', error);
    res.status(500).json({ error: 'Error al crear orden de servicio' });
  }
});

app.put('/api/ordenes-servicio/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const payload = parseOrderPayload(req.body);

  if (!payload.vehiculo_id || !payload.servicio_id || !payload.descripcion || !payload.fecha_ingreso) {
    return res.status(400).json({ error: 'Vehículo, servicio, descripción y fecha son obligatorios' });
  }

  try {
    const result = await pool.query(
      `UPDATE ordenes_servicio
       SET vehiculo_id = $1,
           servicio_id = $2,
           fecha_ingreso = $3,
           descripcion = $4,
           estado = $5,
           prioridad = $6,
           kilometraje = $7,
           costo = $8,
           observaciones = $9,
           actualizado_en = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        payload.vehiculo_id,
        payload.servicio_id,
        payload.fecha_ingreso,
        payload.descripcion,
        payload.estado,
        payload.prioridad,
        payload.kilometraje,
        payload.costo,
        payload.observaciones,
        id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Orden de servicio no encontrada' });
    }

    const refreshed = await pool.query(
      `${orderSelect} WHERE os.id = $1`,
      [id]
    );

    res.json(refreshed.rows[0]);
  } catch (error) {
    console.error('Error updating orden:', error);
    res.status(500).json({ error: 'Error al actualizar orden de servicio' });
  }
});

app.listen(port, () => {
  console.log(`order-service running on port ${port}`);
});
