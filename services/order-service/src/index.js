import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { localDateInTimeZone, startServiceReminderScheduler } from './serviceReminders.js';

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

const requireRole = (...roles) => (req, res, next) => roles.includes(req.user?.rol) || req.user?.rol === 'ADMIN'
  ? next()
  : res.status(403).json({ error: 'No tiene permisos para esta operación' });

const requirePermission = (module, action) => (req, res, next) => ['ADMIN', 'SUPER_USUARIO'].includes(req.user?.rol) || req.user?.permisos?.[module]?.[action] === true
  ? next() : res.status(403).json({ error: 'No tiene el permiso requerido' });

const hasPermission = (user, module, action) => ['ADMIN', 'SUPER_USUARIO'].includes(user?.rol) || user?.permisos?.[module]?.[action] === true;

const allowedStatusTransitions = {
  PENDIENTE: ['EN_PROCESO', 'CANCELADO'],
  EN_PROCESO: ['COMPLETADO', 'CANCELADO'],
  COMPLETADO: [],
  CANCELADO: [],
};

const canTransitionStatus = (current, next) => current === next || allowedStatusTransitions[current]?.includes(next) === true;

const parseOrderPayload = (body) => ({
  vehiculo_id: body.vehiculo_id !== undefined && body.vehiculo_id !== null ? Number(body.vehiculo_id) : null,
  servicio_id: body.servicio_id !== undefined && body.servicio_id !== null ? Number(body.servicio_id) : null,
  fecha_ingreso: body.fecha_ingreso || body.fecha_programada || new Date().toISOString().split('T')[0],
  descripcion: body.descripcion || '',
  estado: body.estado || 'PENDIENTE',
  prioridad: body.prioridad || 'MEDIA',
  kilometraje: body.kilometraje !== undefined && body.kilometraje !== null && body.kilometraje !== '' ? Number(body.kilometraje) : null,
  fecha_proximo_servicio: body.fecha_proximo_servicio || null,
  costo: body.costo !== undefined && body.costo !== null ? Number(body.costo) : 0,
  observaciones: body.observaciones || null,
  articulos: body.articulos,
});

const orderSelect = `
    SELECT os.*, v.placa, v.marca, v.modelo, p.nombre propietario, svc.nombre servicio,
      os.costo + COALESCE((SELECT SUM(oa.cantidad * oa.precio_venta_unitario) FROM ordenes_articulos oa WHERE oa.orden_servicio_id=os.id),0) costo_total,
         COALESCE((
           SELECT json_agg(json_build_object(
             'articulo_id', a.id, 'sku', a.sku, 'nombre', a.nombre, 'tipo', a.tipo,
             'unidad', a.unidad, 'cantidad', oa.cantidad,
             'precio_venta_unitario', oa.precio_venta_unitario,
             'subtotal', oa.cantidad * oa.precio_venta_unitario
           ) ORDER BY a.nombre)
           FROM ordenes_articulos oa
           JOIN inventario_articulos a ON a.id = oa.articulo_id
           WHERE oa.orden_servicio_id = os.id
         ), '[]'::json) articulos
  FROM ordenes_servicio os
  JOIN vehiculos v ON v.id = os.vehiculo_id
  JOIN propietarios p ON p.id = v.propietario_id
  JOIN servicios svc ON svc.id = os.servicio_id
`;

function parseOrderArticles(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) throw Object.assign(new Error('La lista de artículos no es válida'), { statusCode: 400 });
  const quantities = new Map();
  for (const line of value) {
    const articleId = Number(line.articulo_id);
    const quantity = Number(line.cantidad);
    if (!Number.isInteger(articleId) || articleId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      throw Object.assign(new Error('Cada artículo requiere una cantidad mayor a cero'), { statusCode: 400 });
    }
    quantities.set(articleId, (quantities.get(articleId) || 0) + quantity);
  }
  return [...quantities].map(([articulo_id, cantidad]) => ({ articulo_id, cantidad })).sort((a, b) => a.articulo_id - b.articulo_id);
}

async function consumeOrderArticles(db, orderId, userId, items) {
  for (const item of items) {
    const articleResult = await db.query(
      'SELECT id,nombre,stock_actual,precio_compra,precio_venta FROM inventario_articulos WHERE id=$1 AND activo=TRUE FOR UPDATE',
      [item.articulo_id],
    );
    if (!articleResult.rowCount) throw Object.assign(new Error(`El artículo ${item.articulo_id} no existe o está inactivo`), { statusCode: 404 });
    const article = articleResult.rows[0];
    if (Number(article.stock_actual) < item.cantidad) {
      throw Object.assign(new Error(`Stock insuficiente para ${article.nombre}. Disponible: ${article.stock_actual}`), { statusCode: 409 });
    }
    await db.query('UPDATE inventario_articulos SET stock_actual=stock_actual-$1, actualizado_en=NOW() WHERE id=$2', [item.cantidad, article.id]);
    await db.query(
      `INSERT INTO ordenes_articulos(orden_servicio_id,articulo_id,cantidad,precio_venta_unitario,precio_compra_unitario)
       VALUES($1,$2,$3,$4,$5)`,
      [orderId, article.id, item.cantidad, article.precio_venta, article.precio_compra],
    );
    await db.query(
      `INSERT INTO movimientos_inventario(articulo_id,usuario_id,orden_servicio_id,tipo,cantidad,costo_unitario,referencia,observaciones)
       VALUES($1,$2,$3,'CONSUMO_ORDEN',$4,$5,$6,$7)`,
      [article.id, userId, orderId, item.cantidad, article.precio_compra, `OS-${String(orderId).padStart(4, '0')}`, 'Consumo al registrar artículos en orden de servicio'],
    );
  }
}

async function restoreOrderArticles(db, orderId, userId, previousItems) {
  for (const item of previousItems) {
    await db.query('UPDATE inventario_articulos SET stock_actual=stock_actual+$1, actualizado_en=NOW() WHERE id=$2', [item.cantidad, item.articulo_id]);
    await db.query(
      `INSERT INTO movimientos_inventario(articulo_id,usuario_id,orden_servicio_id,tipo,cantidad,costo_unitario,referencia,observaciones)
       VALUES($1,$2,$3,'ENTRADA',$4,$5,$6,$7)`,
      [item.articulo_id, userId, orderId, item.cantidad, item.precio_compra_unitario, `OS-${String(orderId).padStart(4, '0')}`, 'Devolución por actualización de artículos de la orden'],
    );
  }
  await db.query('DELETE FROM ordenes_articulos WHERE orden_servicio_id=$1', [orderId]);
}

function sameOrderArticles(current, requested) {
  if (requested === null) return true;
  const existing = current.map((line) => [Number(line.articulo_id), Number(line.cantidad)]).sort((a, b) => a[0] - b[0]);
  const next = requested.map((line) => [line.articulo_id, line.cantidad]).sort((a, b) => a[0] - b[0]);
  return JSON.stringify(existing) === JSON.stringify(next);
}

app.get('/api/vehiculos/:vehiculoId/historial', authenticateToken, async (req, res) => {
  const { vehiculoId } = req.params;

  try {
    const result = await pool.query(
      `${orderSelect}
       WHERE os.vehiculo_id = $1
         AND ($2::bigint IS NULL OR v.propietario_id = $2)
       ORDER BY os.fecha_ingreso DESC, os.id DESC`,
      [vehiculoId, req.user.rol === 'CLIENTE' ? req.user.propietario_id : null]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching vehicle history:', error);
    res.status(500).json({ error: 'Error al consultar el historial del vehículo' });
  }
});

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

app.get('/api/inventario/articulos', authenticateToken, requirePermission('inventario', 'consultar'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, (a.stock_actual <= a.stock_minimo) bajo_stock
       FROM inventario_articulos a
       WHERE ($1::text IS NULL OR a.nombre ILIKE '%' || $1 || '%' OR COALESCE(a.sku,'') ILIKE '%' || $1 || '%')
       ORDER BY a.activo DESC, a.nombre`,
      [req.query.buscar || null],
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error listing inventory articles:', error);
    return res.status(500).json({ error: 'Error al consultar inventario' });
  }
});

app.post('/api/inventario/articulos', authenticateToken, requirePermission('inventario', 'crear'), async (req, res) => {
  const { sku = null, nombre, categoria = null, tipo, descripcion = null, unidad = 'unidad', stock_minimo = 0, precio_compra = 0, precio_venta = 0 } = req.body;
  if (!nombre?.trim() || !['REPUESTO', 'ACCESORIO'].includes(tipo) || ![stock_minimo, precio_compra, precio_venta].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)) {
    return res.status(400).json({ error: 'Nombre, tipo, stock mínimo y precios válidos son obligatorios' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO inventario_articulos(sku,nombre,categoria,tipo,descripcion,unidad,stock_minimo,precio_compra,precio_venta)
       VALUES(NULLIF(TRIM($1),''),$2,NULLIF(TRIM($3),''),$4,$5,$6,$7,$8,$9) RETURNING *`,
      [sku, nombre.trim(), categoria, tipo, descripcion, unidad, Number(stock_minimo), Number(precio_compra), Number(precio_venta)],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'El SKU ya está registrado' });
    console.error('Error creating inventory article:', error);
    return res.status(500).json({ error: 'Error al crear artículo' });
  }
});

app.put('/api/inventario/articulos/:id', authenticateToken, requirePermission('inventario', 'editar'), async (req, res) => {
  const { sku = null, nombre, categoria = null, tipo, descripcion = null, unidad = 'unidad', stock_minimo = 0, precio_compra = 0, precio_venta = 0, activo = true } = req.body;
  if (!nombre?.trim() || !['REPUESTO', 'ACCESORIO'].includes(tipo) || ![stock_minimo, precio_compra, precio_venta].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)) {
    return res.status(400).json({ error: 'Nombre, tipo, stock mínimo y precios válidos son obligatorios' });
  }
  try {
    const result = await pool.query(
      `UPDATE inventario_articulos SET sku=NULLIF(TRIM($1),''), nombre=$2, categoria=NULLIF(TRIM($3),''), tipo=$4, descripcion=$5,
       unidad=$6, stock_minimo=$7, precio_compra=$8, precio_venta=$9, activo=$10, actualizado_en=NOW()
       WHERE id=$11 RETURNING *`,
      [sku, nombre.trim(), categoria, tipo, descripcion, unidad, Number(stock_minimo), Number(precio_compra), Number(precio_venta), !!activo, req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Artículo no encontrado' });
    return res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'El SKU ya está registrado' });
    console.error('Error updating inventory article:', error);
    return res.status(500).json({ error: 'Error al actualizar artículo' });
  }
});

app.delete('/api/inventario/articulos/:id', authenticateToken, requirePermission('inventario', 'eliminar'), async (req, res) => {
  try {
    const result = await pool.query('UPDATE inventario_articulos SET activo=FALSE, actualizado_en=NOW() WHERE id=$1 AND activo=TRUE RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Artículo no encontrado o ya inactivo' });
    return res.json({ id: result.rows[0].id, activo: false });
  } catch (error) {
    console.error('Error deactivating inventory article:', error);
    return res.status(500).json({ error: 'Error al desactivar artículo' });
  }
});

app.get('/api/inventario/movimientos', authenticateToken, requirePermission('inventario', 'consultar'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, a.sku, a.nombre articulo, u.nombre usuario,
              'OS-' || LPAD(m.orden_servicio_id::text,4,'0') orden
       FROM movimientos_inventario m
       JOIN inventario_articulos a ON a.id=m.articulo_id
       LEFT JOIN usuarios u ON u.id=m.usuario_id
       ORDER BY m.id DESC LIMIT 300`,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error listing inventory movements:', error);
    return res.status(500).json({ error: 'Error al consultar movimientos de inventario' });
  }
});

app.post('/api/inventario/movimientos', authenticateToken, requirePermission('inventario', 'crear'), async (req, res) => {
  const { articulo_id, tipo, cantidad, costo_unitario, referencia = null, observaciones = null } = req.body;
  const quantity = Number(cantidad);
  if (!Number.isInteger(Number(articulo_id)) || !['ENTRADA', 'SALIDA'].includes(tipo) || !Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'Artículo, tipo de movimiento y cantidad positiva son obligatorios' });
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const articleResult = await db.query('SELECT * FROM inventario_articulos WHERE id=$1 AND activo=TRUE FOR UPDATE', [articulo_id]);
    if (!articleResult.rowCount) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Artículo no encontrado o inactivo' });
    }
    const article = articleResult.rows[0];
    if (tipo === 'SALIDA' && Number(article.stock_actual) < quantity) {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: `Stock insuficiente. Disponible: ${article.stock_actual} ${article.unidad}` });
    }
    const unitCost = tipo === 'ENTRADA' ? Number(costo_unitario ?? article.precio_compra) : Number(article.precio_compra);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Costo unitario inválido' });
    }
    const stockDelta = tipo === 'ENTRADA' ? quantity : -quantity;
    await db.query(
      `UPDATE inventario_articulos SET stock_actual=stock_actual+$1,
       precio_compra=CASE WHEN $2='ENTRADA' THEN $3 ELSE precio_compra END, actualizado_en=NOW() WHERE id=$4`,
      [stockDelta, tipo, unitCost, articulo_id],
    );
    const movement = await db.query(
      `INSERT INTO movimientos_inventario(articulo_id,usuario_id,tipo,cantidad,costo_unitario,referencia,observaciones)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [articulo_id, req.user.sub, tipo, quantity, unitCost, referencia, observaciones],
    );
    await db.query('COMMIT');
    return res.status(201).json({ ...movement.rows[0], stock_actual: Number(article.stock_actual) + stockDelta });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Error recording inventory movement:', error);
    return res.status(500).json({ error: 'Error al registrar movimiento de inventario' });
  } finally {
    db.release();
  }
});

app.get('/api/inventario/compras', authenticateToken, requirePermission('inventario', 'consultar'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.nombre usuario,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', d.id, 'articulo_id', d.articulo_id, 'sku', a.sku, 'articulo', a.nombre,
                  'cantidad', d.cantidad, 'costo_compra', d.costo_compra, 'precio_venta', d.precio_venta, 'subtotal', d.subtotal
                ) ORDER BY d.id)
                FROM compras_inventario_detalle d
                JOIN inventario_articulos a ON a.id = d.articulo_id
                WHERE d.compra_id = c.id
              ), '[]'::json) lineas
       FROM compras_inventario c
       LEFT JOIN usuarios u ON u.id = c.usuario_id
       WHERE ($1::date IS NULL OR c.creado_en::date >= $1)
         AND ($2::date IS NULL OR c.creado_en::date <= $2)
       ORDER BY c.id DESC
       LIMIT 300`,
      [req.query.desde || null, req.query.hasta || null],
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error listing purchases:', error);
    return res.status(500).json({ error: 'Error al consultar compras' });
  }
});

app.post('/api/inventario/compras', authenticateToken, requirePermission('inventario', 'crear'), async (req, res) => {
  const { numero_factura, proveedor = null, observaciones = null, lineas } = req.body;
  if (!numero_factura?.trim() || !Array.isArray(lineas) || !lineas.length) {
    return res.status(400).json({ error: 'Número de factura y al menos un artículo son obligatorios' });
  }
  const parsedLines = [];
  for (const line of lineas) {
    const articuloId = Number(line.articulo_id);
    const cantidad = Number(line.cantidad);
    const costoCompra = Number(line.costo_compra);
    const precioVenta = Number(line.precio_venta);
    if (!Number.isInteger(articuloId) || articuloId <= 0 || !Number.isFinite(cantidad) || cantidad <= 0
      || !Number.isFinite(costoCompra) || costoCompra < 0 || !Number.isFinite(precioVenta) || precioVenta < 0) {
      return res.status(400).json({ error: 'Cada línea requiere artículo, cantidad, costo de compra y costo de venta válidos' });
    }
    parsedLines.push({ articulo_id: articuloId, cantidad, costo_compra: costoCompra, precio_venta: precioVenta, subtotal: cantidad * costoCompra });
  }
  const total = parsedLines.reduce((sum, line) => sum + line.subtotal, 0);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const purchase = await db.query(
      `INSERT INTO compras_inventario(numero_factura,proveedor,usuario_id,total,observaciones)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [numero_factura.trim(), proveedor, req.user.sub, total, observaciones],
    );
    for (const line of parsedLines) {
      const articleResult = await db.query('SELECT id FROM inventario_articulos WHERE id=$1 AND activo=TRUE FOR UPDATE', [line.articulo_id]);
      if (!articleResult.rowCount) throw Object.assign(new Error(`El artículo ${line.articulo_id} no existe o está inactivo`), { statusCode: 404 });
      await db.query(
        `UPDATE inventario_articulos SET stock_actual=stock_actual+$1, precio_compra=$2, precio_venta=$3, actualizado_en=NOW() WHERE id=$4`,
        [line.cantidad, line.costo_compra, line.precio_venta, line.articulo_id],
      );
      await db.query(
        `INSERT INTO compras_inventario_detalle(compra_id,articulo_id,cantidad,costo_compra,precio_venta,subtotal)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [purchase.rows[0].id, line.articulo_id, line.cantidad, line.costo_compra, line.precio_venta, line.subtotal],
      );
      await db.query(
        `INSERT INTO movimientos_inventario(articulo_id,usuario_id,compra_id,tipo,cantidad,costo_unitario,referencia,observaciones)
         VALUES($1,$2,$3,'ENTRADA',$4,$5,$6,$7)`,
        [line.articulo_id, req.user.sub, purchase.rows[0].id, line.cantidad, line.costo_compra, numero_factura.trim(), 'Ingreso por compra'],
      );
    }
    await db.query('COMMIT');
    return res.status(201).json({ ...purchase.rows[0], lineas: parsedLines });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Error creating purchase:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Error al registrar la compra' });
  } finally {
    db.release();
  }
});

app.get('/api/inventario/ventas', authenticateToken, requirePermission('inventario', 'consultar'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.*, u.nombre usuario,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', d.id, 'articulo_id', d.articulo_id, 'sku', a.sku, 'articulo', a.nombre,
                  'cantidad', d.cantidad, 'precio_venta', d.precio_venta, 'subtotal', d.subtotal
                ) ORDER BY d.id)
                FROM ventas_inventario_detalle d
                JOIN inventario_articulos a ON a.id = d.articulo_id
                WHERE d.venta_id = v.id
              ), '[]'::json) lineas
       FROM ventas_inventario v
       LEFT JOIN usuarios u ON u.id = v.usuario_id
       WHERE ($1::date IS NULL OR v.creado_en::date >= $1)
         AND ($2::date IS NULL OR v.creado_en::date <= $2)
       ORDER BY v.id DESC
       LIMIT 300`,
      [req.query.desde || null, req.query.hasta || null],
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error listing sales:', error);
    return res.status(500).json({ error: 'Error al consultar ventas' });
  }
});

app.post('/api/inventario/ventas', authenticateToken, requirePermission('inventario', 'crear'), async (req, res) => {
  const { observaciones = null, lineas } = req.body;
  if (!Array.isArray(lineas) || !lineas.length) {
    return res.status(400).json({ error: 'Agregue al menos un artículo a la venta' });
  }
  const parsedLines = [];
  for (const line of lineas) {
    const articuloId = Number(line.articulo_id);
    const cantidad = Number(line.cantidad);
    const precioVenta = line.precio_venta === undefined || line.precio_venta === null || line.precio_venta === '' ? null : Number(line.precio_venta);
    if (!Number.isInteger(articuloId) || articuloId <= 0 || !Number.isFinite(cantidad) || cantidad <= 0
      || (precioVenta !== null && (!Number.isFinite(precioVenta) || precioVenta < 0))) {
      return res.status(400).json({ error: 'Cada línea requiere artículo, cantidad y precio de venta válidos' });
    }
    parsedLines.push({ articulo_id: articuloId, cantidad, precio_venta: precioVenta });
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const sale = await db.query(
      `INSERT INTO ventas_inventario(usuario_id,total,observaciones) VALUES($1,0,$2) RETURNING *`,
      [req.user.sub, observaciones],
    );
    let total = 0;
    for (const line of parsedLines) {
      const articleResult = await db.query(
        'SELECT id,nombre,unidad,stock_actual,precio_compra,precio_venta FROM inventario_articulos WHERE id=$1 AND activo=TRUE FOR UPDATE',
        [line.articulo_id],
      );
      if (!articleResult.rowCount) throw Object.assign(new Error(`El artículo ${line.articulo_id} no existe o está inactivo`), { statusCode: 404 });
      const article = articleResult.rows[0];
      if (Number(article.stock_actual) < line.cantidad) {
        throw Object.assign(new Error(`Stock insuficiente para ${article.nombre}. Disponible: ${article.stock_actual}`), { statusCode: 409 });
      }
      const unitPrice = line.precio_venta ?? Number(article.precio_venta);
      const subtotal = line.cantidad * unitPrice;
      total += subtotal;
      await db.query('UPDATE inventario_articulos SET stock_actual=stock_actual-$1, actualizado_en=NOW() WHERE id=$2', [line.cantidad, article.id]);
      await db.query(
        `INSERT INTO ventas_inventario_detalle(venta_id,articulo_id,cantidad,precio_venta,subtotal)
         VALUES($1,$2,$3,$4,$5)`,
        [sale.rows[0].id, article.id, line.cantidad, unitPrice, subtotal],
      );
      await db.query(
        `INSERT INTO movimientos_inventario(articulo_id,usuario_id,venta_id,tipo,cantidad,costo_unitario,referencia,observaciones)
         VALUES($1,$2,$3,'SALIDA',$4,$5,$6,$7)`,
        [article.id, req.user.sub, sale.rows[0].id, line.cantidad, article.precio_compra, `VT-${String(sale.rows[0].id).padStart(4, '0')}`, 'Salida por venta'],
      );
    }
    await db.query('UPDATE ventas_inventario SET total=$1 WHERE id=$2', [total, sale.rows[0].id]);
    await db.query('COMMIT');
    return res.status(201).json({ ...sale.rows[0], total });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Error creating sale:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Error al registrar la venta' });
  } finally {
    db.release();
  }
});

app.get('/api/tickets/:id/status', async (req, res) => {
  try {
    const result = await pool.query(
            `SELECT os.id, os.fecha_ingreso, os.fecha_proximo_servicio, os.kilometraje,
              os.estado, os.prioridad, os.descripcion, os.costo,
              v.placa, v.marca, v.modelo, svc.nombre servicio
       FROM ordenes_servicio os
       JOIN vehiculos v ON v.id = os.vehiculo_id
       JOIN servicios svc ON svc.id = os.servicio_id
       WHERE os.id = $1`,
      [req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Ticket no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching public ticket:', error);
    res.status(500).json({ error: 'Error al consultar el ticket' });
  }
});

app.get('/api/ordenes-servicio', authenticateToken, async (req, res) => {
  try {
    const searchTerm = req.query.buscar || null;
    const result = await pool.query(
      `${orderSelect}
       WHERE ($1::text IS NULL OR os.descripcion ILIKE '%' || $1 || '%' OR v.placa ILIKE '%' || $1 || '%' OR svc.nombre ILIKE '%' || $1 || '%' OR p.nombre ILIKE '%' || $1 || '%')
         AND ($2::bigint IS NULL OR v.propietario_id = $2)
       ORDER BY os.id DESC`,
      [searchTerm, req.user.rol === 'CLIENTE' ? req.user.propietario_id : null]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching ordenes_servicio:', error);
    res.status(500).json({ error: 'Error al obtener órdenes de servicio' });
  }
});

app.get('/api/recordatorios-servicio', authenticateToken, requirePermission('ordenes', 'consultar'), async (req, res) => {
  try {
    const today = localDateInTimeZone();
    const emailConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
    const whatsappConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM && process.env.TWILIO_WHATSAPP_CONTENT_SID);
    const result = await pool.query(
      `SELECT os.id orden_id, os.fecha_proximo_servicio, os.kilometraje, os.estado orden_estado,
              v.placa, v.marca, v.modelo, svc.nombre servicio, p.nombre propietario,
              p.correo, p.telefono,
              CASE WHEN NULLIF(TRIM(p.correo), '') IS NULL THEN 'SIN_CONTACTO'
                   WHEN email.estado IS NOT NULL THEN email.estado
                   WHEN $2::boolean THEN 'PENDIENTE' ELSE 'NO_CONFIGURADO' END email_estado,
              email.error email_error, email.intentos email_intentos, email.enviado_en email_enviado_en,
              CASE WHEN NULLIF(TRIM(p.telefono), '') IS NULL THEN 'SIN_CONTACTO'
                   WHEN whatsapp.estado IS NOT NULL THEN whatsapp.estado
                   WHEN $3::boolean THEN 'PENDIENTE' ELSE 'NO_CONFIGURADO' END whatsapp_estado,
              whatsapp.error whatsapp_error, whatsapp.intentos whatsapp_intentos, whatsapp.enviado_en whatsapp_enviado_en
       FROM ordenes_servicio os
       JOIN vehiculos v ON v.id = os.vehiculo_id
       JOIN propietarios p ON p.id = v.propietario_id
       JOIN servicios svc ON svc.id = os.servicio_id
       LEFT JOIN recordatorios_servicio email ON email.orden_servicio_id = os.id
         AND email.canal = 'EMAIL' AND email.fecha_proximo_servicio = os.fecha_proximo_servicio
       LEFT JOIN recordatorios_servicio whatsapp ON whatsapp.orden_servicio_id = os.id
         AND whatsapp.canal = 'WHATSAPP' AND whatsapp.fecha_proximo_servicio = os.fecha_proximo_servicio
       WHERE os.fecha_proximo_servicio IS NOT NULL
         AND os.fecha_proximo_servicio BETWEEN ($1::date - 90) AND ($1::date + 7)
         AND os.estado <> 'CANCELADO'
         AND ($4::bigint IS NULL OR v.propietario_id = $4)
       ORDER BY os.fecha_proximo_servicio ASC, os.id DESC`,
      [today, emailConfigured, whatsappConfigured, req.user.rol === 'CLIENTE' ? req.user.propietario_id : null],
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error fetching service reminders:', error);
    return res.status(500).json({ error: 'Error al consultar recordatorios de servicio' });
  }
});

app.get('/api/ordenes-servicio/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `${orderSelect} WHERE os.id = $1
       AND ($2::bigint IS NULL OR v.propietario_id = $2)`,
      [id, req.user.rol === 'CLIENTE' ? req.user.propietario_id : null]
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

app.patch('/api/ordenes-servicio/:id/estado', authenticateToken, requirePermission('ordenes', 'editar'), async (req, res) => {
  const { estado } = req.body;
  if (!Object.hasOwn(allowedStatusTransitions, estado)) {
    return res.status(400).json({ error: 'Estado de orden inválido' });
  }
  try {
    const current = await pool.query('SELECT estado FROM ordenes_servicio WHERE id = $1', [req.params.id]);
    if (!current.rowCount) return res.status(404).json({ error: 'Orden de servicio no encontrada' });
    const currentStatus = current.rows[0].estado;
    if (!canTransitionStatus(currentStatus, estado)) {
      return res.status(409).json({ error: `No se permite cambiar de ${currentStatus} a ${estado}` });
    }
    const updated = await pool.query(
      `UPDATE ordenes_servicio SET estado = $1, actualizado_en = NOW() WHERE id = $2 RETURNING id, estado, actualizado_en`,
      [estado, req.params.id],
    );
    return res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error changing order status:', error);
    return res.status(500).json({ error: 'Error al actualizar el estado de la orden' });
  }
});

app.post('/api/ordenes-servicio', authenticateToken, requirePermission('ordenes', 'crear'), async (req, res) => {
  const payload = parseOrderPayload(req.body);
  let articleLines;
  try { articleLines = parseOrderArticles(payload.articulos) || []; }
  catch (error) { return res.status(error.statusCode || 400).json({ error: error.message }); }

  if (!payload.vehiculo_id || !payload.servicio_id || !payload.descripcion || !payload.fecha_ingreso || payload.kilometraje === null || !payload.fecha_proximo_servicio) {
    return res.status(400).json({ error: 'Vehículo, servicio, descripción, kilometraje y fecha estimada del próximo servicio son obligatorios' });
  }
  if (payload.kilometraje < 0 || payload.fecha_proximo_servicio < payload.fecha_ingreso) {
    return res.status(400).json({ error: 'El kilometraje debe ser válido y la fecha estimada no puede ser anterior al ingreso' });
  }
  if (payload.estado !== 'PENDIENTE') {
    return res.status(400).json({ error: 'Las órdenes nuevas deben iniciar en estado PENDIENTE' });
  }
  if (articleLines.length && !hasPermission(req.user, 'inventario', 'crear')) {
    return res.status(403).json({ error: 'No tiene permiso para consumir artículos del inventario' });
  }

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query(
      `INSERT INTO ordenes_servicio(vehiculo_id, servicio_id, fecha_ingreso, fecha_proximo_servicio, descripcion, estado, prioridad, kilometraje, costo, observaciones)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        payload.vehiculo_id,
        payload.servicio_id,
        payload.fecha_ingreso,
        payload.fecha_proximo_servicio,
        payload.descripcion,
        payload.estado,
        payload.prioridad,
        payload.kilometraje,
        payload.costo,
        payload.observaciones,
      ]
    );
    if (articleLines.length) await consumeOrderArticles(db, result.rows[0].id, req.user.sub, articleLines);
    await db.query('COMMIT');

    const order = await pool.query(
      `${orderSelect} WHERE os.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(order.rows[0]);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Error creating orden:', error);
    return res.status(error.statusCode || (error.code === '23503' ? 400 : 500)).json({ error: error.message || 'Error al crear orden de servicio' });
  } finally {
    db.release();
  }
});

app.put('/api/ordenes-servicio/:id', authenticateToken, requirePermission('ordenes', 'editar'), async (req, res) => {
  const { id } = req.params;
  const payload = parseOrderPayload(req.body);
  let requestedArticles;
  try { requestedArticles = parseOrderArticles(payload.articulos); }
  catch (error) { return res.status(error.statusCode || 400).json({ error: error.message }); }

  if (!payload.vehiculo_id || !payload.servicio_id || !payload.descripcion || !payload.fecha_ingreso || payload.kilometraje === null || !payload.fecha_proximo_servicio) {
    return res.status(400).json({ error: 'Vehículo, servicio, descripción, kilometraje y fecha estimada del próximo servicio son obligatorios' });
  }
  if (payload.kilometraje < 0 || payload.fecha_proximo_servicio < payload.fecha_ingreso) {
    return res.status(400).json({ error: 'El kilometraje debe ser válido y la fecha estimada no puede ser anterior al ingreso' });
  }

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const currentOrder = await db.query('SELECT estado FROM ordenes_servicio WHERE id = $1 FOR UPDATE', [id]);
    if (!currentOrder.rowCount) throw Object.assign(new Error('Orden de servicio no encontrada'), { statusCode: 404 });
    if (!canTransitionStatus(currentOrder.rows[0].estado, payload.estado)) {
      throw Object.assign(new Error(`No se permite cambiar de ${currentOrder.rows[0].estado} a ${payload.estado}`), { statusCode: 409 });
    }
    const currentArticlesResult = await db.query(
      'SELECT articulo_id,cantidad,precio_venta_unitario,precio_compra_unitario FROM ordenes_articulos WHERE orden_servicio_id=$1 ORDER BY articulo_id FOR UPDATE',
      [id],
    );
    const currentArticles = currentArticlesResult.rows;
    const articlesChanged = requestedArticles !== null && !sameOrderArticles(currentArticles, requestedArticles);
    if (articlesChanged && !hasPermission(req.user, 'inventario', 'crear')) {
      throw Object.assign(new Error('No tiene permiso para agregar o quitar artículos del inventario'), { statusCode: 403 });
    }
    const result = await db.query(
      `UPDATE ordenes_servicio
       SET vehiculo_id = $1,
           servicio_id = $2,
           fecha_ingreso = $3,
             fecha_proximo_servicio = $4,
             descripcion = $5,
             estado = $6,
             prioridad = $7,
             kilometraje = $8,
             costo = $9,
             observaciones = $10,
           actualizado_en = NOW()
           WHERE id = $11
       RETURNING *`,
      [
        payload.vehiculo_id,
        payload.servicio_id,
        payload.fecha_ingreso,
        payload.fecha_proximo_servicio,
        payload.descripcion,
        payload.estado,
        payload.prioridad,
        payload.kilometraje,
        payload.costo,
        payload.observaciones,
        id,
      ]
    );

    if (!result.rowCount) throw Object.assign(new Error('Orden de servicio no encontrada'), { statusCode: 404 });
    if (articlesChanged) {
      await restoreOrderArticles(db, id, req.user.sub, currentArticles);
      if (requestedArticles.length) await consumeOrderArticles(db, id, req.user.sub, requestedArticles);
    }
    await db.query('COMMIT');

    const refreshed = await pool.query(
      `${orderSelect} WHERE os.id = $1`,
      [id]
    );

    return res.json(refreshed.rows[0]);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Error updating orden:', error);
    return res.status(error.statusCode || (error.code === '23503' ? 400 : 500)).json({ error: error.message || 'Error al actualizar orden de servicio' });
  } finally {
    db.release();
  }
});

app.delete('/api/ordenes-servicio/:id', authenticateToken, requirePermission('ordenes', 'eliminar'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM ordenes_servicio WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Orden de servicio no encontrada' });
    return res.json({ id: result.rows[0].id, eliminado: true });
  } catch (error) {
    console.error('Error deleting orden:', error);
    return res.status(500).json({ error: 'Error al eliminar orden de servicio' });
  }
});

app.listen(port, () => {
  console.log(`order-service running on port ${port}`);
  startServiceReminderScheduler(pool);
});
