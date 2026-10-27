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
const geminiKey = process.env.GEMINI_API_KEY || "";
const geminiModel = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const fallbackModels = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.5-flash,gemini-3.1-flash-lite")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "200kb" }));

function authenticateToken(req, res, next) {
  const header = req.headers.authorization || "";
  try {
    const token = header.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Token ausente");
    req.user = jwt.verify(token, secret);
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido o ausente" });
  }
}

const isAdmin = (user) => user.rol === "SUPER_USUARIO" || user.rol === "ADMIN";
const hasPermission = (user, module, action) => isAdmin(user) || user.permisos?.[module]?.[action] === true;
const clientOwnerId = (user) => (user.rol === "CLIENTE" ? user.propietario_id : null);
const noPermission = (module) => ({ error: `No tienes permiso de consulta en el módulo ${module}` });

const orderTotal = "os.costo + COALESCE((SELECT SUM(oa.cantidad * oa.precio_venta_unitario) FROM ordenes_articulos oa WHERE oa.orden_servicio_id = os.id), 0)";

const tools = {
  resumen_operativo: {
    declaration: {
      name: "resumen_operativo",
      description: "Obtiene los totales generales del taller: propietarios, vehículos, órdenes por estado, artículos con bajo stock y servicios próximos en 7 días.",
      parameters: { type: "OBJECT", properties: {} },
    },
    async execute(user) {
      const scope = clientOwnerId(user);
      const result = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM ordenes_servicio os JOIN vehiculos v ON v.id = os.vehiculo_id WHERE os.estado = 'PENDIENTE' AND ($1::bigint IS NULL OR v.propietario_id = $1))::int ordenes_pendientes,
           (SELECT COUNT(*) FROM ordenes_servicio os JOIN vehiculos v ON v.id = os.vehiculo_id WHERE os.estado = 'EN_PROCESO' AND ($1::bigint IS NULL OR v.propietario_id = $1))::int ordenes_en_proceso,
           (SELECT COUNT(*) FROM ordenes_servicio os JOIN vehiculos v ON v.id = os.vehiculo_id WHERE os.estado <> 'CANCELADO' AND os.fecha_proximo_servicio BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND ($1::bigint IS NULL OR v.propietario_id = $1))::int servicios_proximos_7_dias,
           (SELECT COUNT(*) FROM ordenes_servicio os JOIN vehiculos v ON v.id = os.vehiculo_id WHERE os.estado <> 'CANCELADO' AND os.fecha_proximo_servicio < CURRENT_DATE AND ($1::bigint IS NULL OR v.propietario_id = $1))::int servicios_vencidos`,
        [scope],
      );
      if (scope !== null) return result.rows[0];
      const extra = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM propietarios WHERE activo)::int propietarios,
           (SELECT COUNT(*) FROM vehiculos)::int vehiculos,
           (SELECT COUNT(*) FROM inventario_articulos WHERE activo)::int articulos_activos,
           (SELECT COUNT(*) FROM inventario_articulos WHERE activo AND stock_actual <= stock_minimo)::int articulos_bajo_stock`,
      );
      return { ...result.rows[0], ...extra.rows[0] };
    },
  },
  consultar_ordenes: {
    declaration: {
      name: "consultar_ordenes",
      description: "Lista las órdenes de servicio con vehículo, propietario, servicio, estado, fechas y costo total. Puede filtrar por estado o texto.",
      parameters: {
        type: "OBJECT",
        properties: {
          estado: { type: "STRING", description: "Filtrar por estado: PENDIENTE, EN_PROCESO, COMPLETADO o CANCELADO" },
          buscar: { type: "STRING", description: "Texto a buscar en placa, propietario, servicio o descripción" },
          limite: { type: "INTEGER", description: "Cantidad máxima de resultados, por defecto 10" },
        },
      },
    },
    async execute(user, args) {
      if (!hasPermission(user, "ordenes", "consultar")) return noPermission("órdenes");
      const result = await pool.query(
        `SELECT os.id, os.estado, os.prioridad, os.fecha_ingreso, os.fecha_proximo_servicio, os.kilometraje,
                LEFT(os.descripcion, 120) descripcion, ${orderTotal} costo_total,
                v.placa, v.marca, v.modelo, p.nombre propietario, s.nombre servicio
         FROM ordenes_servicio os
         JOIN vehiculos v ON v.id = os.vehiculo_id
         JOIN propietarios p ON p.id = v.propietario_id
         JOIN servicios s ON s.id = os.servicio_id
         WHERE ($1::text IS NULL OR os.estado = $1)
           AND ($2::text IS NULL OR v.placa ILIKE '%' || $2 || '%' OR p.nombre ILIKE '%' || $2 || '%' OR s.nombre ILIKE '%' || $2 || '%' OR os.descripcion ILIKE '%' || $2 || '%')
           AND ($3::bigint IS NULL OR p.id = $3)
         ORDER BY os.id DESC
         LIMIT $4`,
        [args.estado || null, args.buscar || null, clientOwnerId(user), Math.min(Number(args.limite) || 10, 20)],
      );
      return { ordenes: result.rows, total: result.rowCount };
    },
  },
  consultar_vehiculos: {
    declaration: {
      name: "consultar_vehiculos",
      description: "Lista vehículos registrados con placa, marca, modelo, año, propietario y kilometraje.",
      parameters: {
        type: "OBJECT",
        properties: { buscar: { type: "STRING", description: "Texto a buscar en placa, marca, modelo o propietario" } },
      },
    },
    async execute(user, args) {
      if (!hasPermission(user, "vehiculos", "consultar")) return noPermission("vehículos");
      const result = await pool.query(
        `SELECT v.placa, v.tipo, v.marca, v.modelo, v.anio, v.kilometraje_actual, v.estado, p.nombre propietario
         FROM vehiculos v JOIN propietarios p ON p.id = v.propietario_id
         WHERE ($1::text IS NULL OR v.placa ILIKE '%' || $1 || '%' OR v.marca ILIKE '%' || $1 || '%' OR v.modelo ILIKE '%' || $1 || '%' OR p.nombre ILIKE '%' || $1 || '%')
           AND ($2::bigint IS NULL OR p.id = $2)
         ORDER BY v.id DESC LIMIT 15`,
        [args.buscar || null, clientOwnerId(user)],
      );
      return { vehiculos: result.rows, total: result.rowCount };
    },
  },
  consultar_propietarios: {
    declaration: {
      name: "consultar_propietarios",
      description: "Lista propietarios o clientes del taller con su información de contacto.",
      parameters: {
        type: "OBJECT",
        properties: { buscar: { type: "STRING", description: "Texto a buscar en nombre, NIT, teléfono o correo" } },
      },
    },
    async execute(user, args) {
      if (!hasPermission(user, "propietarios", "consultar")) return noPermission("propietarios");
      const result = await pool.query(
        `SELECT id, nombre, tipo, nit, telefono, correo, direccion
         FROM propietarios
         WHERE activo AND ($1::text IS NULL OR nombre ILIKE '%' || $1 || '%' OR COALESCE(nit,'') ILIKE '%' || $1 || '%' OR COALESCE(telefono,'') ILIKE '%' || $1 || '%' OR COALESCE(correo,'') ILIKE '%' || $1 || '%')
         ORDER BY nombre LIMIT 15`,
        [args.buscar || null],
      );
      return { propietarios: result.rows, total: result.rowCount };
    },
  },
  consultar_servicios: {
    declaration: {
      name: "consultar_servicios",
      description: "Lista el catálogo de servicios del taller con precio.",
      parameters: { type: "OBJECT", properties: {} },
    },
    async execute(user) {
      if (!hasPermission(user, "servicios", "consultar")) return noPermission("servicios");
      const result = await pool.query(
        `SELECT nombre, LEFT(COALESCE(descripcion,''), 100) descripcion, precio FROM servicios WHERE activo ORDER BY nombre LIMIT 20`,
      );
      return { servicios: result.rows };
    },
  },
  consultar_inventario: {
    declaration: {
      name: "consultar_inventario",
      description: "Consulta artículos del inventario (repuestos y accesorios) con existencias, stock mínimo y precios.",
      parameters: {
        type: "OBJECT",
        properties: {
          buscar: { type: "STRING", description: "Texto a buscar en nombre, código o categoría" },
          solo_bajo_stock: { type: "BOOLEAN", description: "Si es verdadero, solo muestra artículos en o bajo su stock mínimo" },
        },
      },
    },
    async execute(user, args) {
      if (!hasPermission(user, "inventario", "consultar")) return noPermission("inventario");
      const result = await pool.query(
        `SELECT sku codigo, nombre, categoria, tipo, stock_actual, stock_minimo, precio_compra, precio_venta
         FROM inventario_articulos
         WHERE activo
           AND ($1::boolean IS NULL OR stock_actual <= stock_minimo)
           AND ($2::text IS NULL OR nombre ILIKE '%' || $2 || '%' OR COALESCE(sku,'') ILIKE '%' || $2 || '%' OR COALESCE(categoria,'') ILIKE '%' || $2 || '%')
         ORDER BY nombre LIMIT 20`,
        [args.solo_bajo_stock === true ? true : null, args.buscar || null],
      );
      return { articulos: result.rows, total: result.rowCount };
    },
  },
  consultar_recordatorios: {
    declaration: {
      name: "consultar_recordatorios",
      description: "Lista los próximos servicios programados (hasta 7 días adelante) y los vencidos, con vehículo y propietario.",
      parameters: { type: "OBJECT", properties: {} },
    },
    async execute(user) {
      if (!hasPermission(user, "ordenes", "consultar")) return noPermission("órdenes");
      const result = await pool.query(
        `SELECT os.id, os.fecha_proximo_servicio, os.estado, v.placa, v.marca, v.modelo, p.nombre propietario, s.nombre servicio,
                (os.fecha_proximo_servicio - CURRENT_DATE)::int dias_restantes
         FROM ordenes_servicio os
         JOIN vehiculos v ON v.id = os.vehiculo_id
         JOIN propietarios p ON p.id = v.propietario_id
         JOIN servicios s ON s.id = os.servicio_id
         WHERE os.fecha_proximo_servicio IS NOT NULL AND os.estado <> 'CANCELADO'
           AND os.fecha_proximo_servicio <= CURRENT_DATE + 7
           AND ($1::bigint IS NULL OR p.id = $1)
         ORDER BY os.fecha_proximo_servicio ASC LIMIT 15`,
        [clientOwnerId(user)],
      );
      return { recordatorios: result.rows, total: result.rowCount };
    },
  },
  consultar_compras_recientes: {
    declaration: {
      name: "consultar_compras_recientes",
      description: "Lista las compras de inventario más recientes con factura, proveedor, total y artículos.",
      parameters: { type: "OBJECT", properties: {} },
    },
    async execute(user) {
      if (!hasPermission(user, "inventario", "consultar")) return noPermission("inventario");
      const result = await pool.query(
        `SELECT c.numero_factura, c.proveedor, c.total, c.creado_en::date fecha,
                (SELECT COUNT(*) FROM compras_inventario_detalle d WHERE d.compra_id = c.id)::int articulos
         FROM compras_inventario c ORDER BY c.id DESC LIMIT 10`,
      );
      return { compras: result.rows };
    },
  },
  consultar_ventas_recientes: {
    declaration: {
      name: "consultar_ventas_recientes",
      description: "Lista las ventas de inventario más recientes con total y cantidad de artículos.",
      parameters: { type: "OBJECT", properties: {} },
    },
    async execute(user) {
      if (!hasPermission(user, "inventario", "consultar")) return noPermission("inventario");
      const result = await pool.query(
        `SELECT v.id, v.total, v.creado_en::date fecha,
                (SELECT COUNT(*) FROM ventas_inventario_detalle d WHERE d.venta_id = v.id)::int articulos
         FROM ventas_inventario v ORDER BY v.id DESC LIMIT 10`,
      );
      return { ventas: result.rows };
    },
  },
  generar_reporte: {
    declaration: {
      name: "generar_reporte",
      description: "Prepara un reporte descargable del sistema en PDF o Excel. Úsala cuando el usuario pida generar, descargar o exportar un reporte. Requiere identificar tipo de reporte y formato.",
      parameters: {
        type: "OBJECT",
        properties: {
          tipo: { type: "STRING", enum: ["ordenes", "propietarios", "vehiculos", "servicios", "existencias", "compras", "ventas", "movimientos"], description: "Tipo de reporte solicitado" },
          formato: { type: "STRING", enum: ["PDF", "EXCEL"], description: "Formato que pidió el usuario" },
          desde: { type: "STRING", description: "Fecha inicial AAAA-MM-DD para órdenes, compras, ventas o movimientos" },
          hasta: { type: "STRING", description: "Fecha final AAAA-MM-DD para órdenes, compras, ventas o movimientos" },
        },
        required: ["tipo", "formato"],
      },
    },
    async execute(user, args) {
      if (!hasPermission(user, "reportes", "consultar")) return { error: "No tienes permiso para generar reportes" };
      const definitions = {
        ordenes: { title: "Órdenes de servicio", file: "ordenes", permission: "ordenes", columns: ["Orden", "Ingreso", "Próximo servicio", "Placa", "Vehículo", "Propietario", "Servicio", "Estado", "Prioridad", "Kilometraje", "Mano de obra Q", "Artículos Q", "Total Q"] },
        propietarios: { title: "Propietarios", file: "propietarios", permission: "propietarios", columns: ["ID", "Nombre", "Tipo", "NIT", "Teléfono", "Correo", "Dirección", "Estado"] },
        vehiculos: { title: "Vehículos", file: "vehiculos", permission: "vehiculos", columns: ["Placa", "Marca", "Modelo", "Tipo", "Año", "Propietario", "Kilometraje", "Estado"] },
        servicios: { title: "Catálogo de servicios", file: "servicios", permission: "servicios", columns: ["Servicio", "Descripción", "Precio Q", "Estado"] },
        existencias: { title: "Existencias actuales", file: "existencias", permission: "inventario", columns: ["Código", "Artículo", "Categoría", "Tipo", "Existencia", "Mínimo", "Costo compra Q", "Costo venta Q", "Valorizado Q", "Estado"] },
        compras: { title: "Compras de inventario", file: "compras", permission: "inventario", columns: ["Factura", "Proveedor", "Fecha", "Código", "Artículo", "Cantidad", "Costo compra Q", "Costo venta Q", "Subtotal Q"] },
        ventas: { title: "Ventas de inventario", file: "ventas", permission: "inventario", columns: ["Venta", "Fecha", "Código", "Artículo", "Cantidad", "Costo venta Q", "Subtotal Q"] },
        movimientos: { title: "Movimientos de inventario", file: "movimientos", permission: "inventario", columns: ["Fecha", "Código", "Artículo", "Movimiento", "Cantidad", "Referencia", "Usuario"] },
      };
      const definition = definitions[args.tipo];
      if (!definition) return { error: "Ese tipo de reporte no está disponible" };
      if (!hasPermission(user, definition.permission, "consultar")) {
        return { error: `No tienes permiso de consulta en el módulo ${definition.permission}` };
      }

      const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
      const desde = validDate(args.desde) ? args.desde : null;
      const hasta = validDate(args.hasta) ? args.hasta : null;
      const ownerId = clientOwnerId(user);
      let rows;
      let total;
      let params;

      switch (args.tipo) {
        case "propietarios": {
          const result = await pool.query(
            `SELECT id,nombre,CASE WHEN tipo='EMPRESA' THEN 'Empresa' ELSE 'Individual' END tipo,
                    COALESCE(nit,'—') nit,COALESCE(telefono,'—') telefono,COALESCE(correo,'—') correo,
                    COALESCE(direccion,'—') direccion,CASE WHEN activo THEN 'Activo' ELSE 'Inactivo' END estado
             FROM propietarios WHERE activo ORDER BY nombre LIMIT 5000`,
          );
          rows = result.rows.map((row) => Object.values(row));
          total = `${rows.length} propietarios registrados`;
          break;
        }
        case "vehiculos": {
          params = [ownerId];
          const result = await pool.query(
            `SELECT v.placa,v.marca,v.modelo,v.tipo,v.anio,p.nombre propietario,v.kilometraje_actual,
                    COALESCE(v.estado,'ACTIVO') estado
             FROM vehiculos v JOIN propietarios p ON p.id=v.propietario_id
             WHERE ($1::bigint IS NULL OR p.id=$1) ORDER BY v.id DESC LIMIT 5000`, params,
          );
          rows = result.rows.map((row) => Object.values(row));
          total = `${rows.length} vehículos registrados`;
          break;
        }
        case "servicios": {
          const result = await pool.query(
            `SELECT nombre,COALESCE(descripcion,'—') descripcion,precio,CASE WHEN activo THEN 'Activo' ELSE 'Inactivo' END estado
             FROM servicios ORDER BY nombre LIMIT 5000`,
          );
          rows = result.rows.map((row) => Object.values(row));
          total = `${rows.length} servicios en catálogo`;
          break;
        }
        case "ordenes": {
          params = [desde, hasta, ownerId];
          const result = await pool.query(
            `SELECT 'OS-'||LPAD(os.id::text,4,'0'),os.fecha_ingreso,COALESCE(os.fecha_proximo_servicio::text,'—'),
                    v.placa,v.marca||' '||v.modelo,p.nombre,s.nombre,os.estado,os.prioridad,os.kilometraje,
                    os.costo,COALESCE((SELECT SUM(oa.cantidad*oa.precio_venta_unitario) FROM ordenes_articulos oa WHERE oa.orden_servicio_id=os.id),0),
                    ${orderTotal}
             FROM ordenes_servicio os JOIN vehiculos v ON v.id=os.vehiculo_id
             JOIN propietarios p ON p.id=v.propietario_id JOIN servicios s ON s.id=os.servicio_id
             WHERE ($1::date IS NULL OR os.fecha_ingreso >= $1) AND ($2::date IS NULL OR os.fecha_ingreso <= $2)
               AND ($3::bigint IS NULL OR p.id=$3)
             ORDER BY os.id DESC LIMIT 5000`, params,
          );
          rows = result.rows.map((row) => Object.values(row));
          const billed = result.rows.reduce((sum, row) => sum + Number(row.costo_total || 0), 0);
          total = `${rows.length} órdenes · Total Q ${billed.toFixed(2)}`;
          break;
        }
        case "existencias": {
          const result = await pool.query(
            `SELECT COALESCE(sku,'—'),nombre,COALESCE(categoria,'—'),CASE WHEN tipo='REPUESTO' THEN 'Repuesto' ELSE 'Accesorio' END,
                    stock_actual,stock_minimo,precio_compra,precio_venta,stock_actual*precio_compra,
                    CASE WHEN activo THEN 'Activo' ELSE 'Inactivo' END
             FROM inventario_articulos ORDER BY nombre LIMIT 5000`,
          );
          rows = result.rows.map((row) => Object.values(row));
          const valued = result.rows.reduce((sum, row) => sum + Number(row[8] || 0), 0);
          total = `Inventario valorizado Q ${valued.toFixed(2)}`;
          break;
        }
        case "compras": {
          params = [desde, hasta];
          const result = await pool.query(
            `SELECT c.numero_factura,COALESCE(c.proveedor,'—'),c.creado_en::date,COALESCE(a.sku,'—'),a.nombre,
                    d.cantidad,d.costo_compra,d.precio_venta,d.subtotal
             FROM compras_inventario c JOIN compras_inventario_detalle d ON d.compra_id=c.id
             JOIN inventario_articulos a ON a.id=d.articulo_id
             WHERE ($1::date IS NULL OR c.creado_en::date >= $1) AND ($2::date IS NULL OR c.creado_en::date <= $2)
             ORDER BY c.id DESC LIMIT 5000`, params,
          );
          rows = result.rows.map((row) => Object.values(row));
          total = `${rows.length} líneas de compra`;
          break;
        }
        case "ventas": {
          params = [desde, hasta];
          const result = await pool.query(
            `SELECT 'VT-'||LPAD(v.id::text,4,'0'),v.creado_en::date,COALESCE(a.sku,'—'),a.nombre,d.cantidad,d.precio_venta,d.subtotal
             FROM ventas_inventario v JOIN ventas_inventario_detalle d ON d.venta_id=v.id
             JOIN inventario_articulos a ON a.id=d.articulo_id
             WHERE ($1::date IS NULL OR v.creado_en::date >= $1) AND ($2::date IS NULL OR v.creado_en::date <= $2)
             ORDER BY v.id DESC LIMIT 5000`, params,
          );
          rows = result.rows.map((row) => Object.values(row));
          total = `${rows.length} líneas de venta`;
          break;
        }
        case "movimientos": {
          params = [desde, hasta];
          const result = await pool.query(
            `SELECT m.creado_en,COALESCE(a.sku,'—'),a.nombre,
                    CASE WHEN m.tipo='CONSUMO_ORDEN' THEN 'Consumo en orden' WHEN m.tipo='ENTRADA' THEN 'Ingreso' ELSE 'Salida' END,
                    m.cantidad,COALESCE('OS-'||LPAD(m.orden_servicio_id::text,4,'0'),m.referencia,'—'),COALESCE(u.nombre,'Sistema')
             FROM movimientos_inventario m JOIN inventario_articulos a ON a.id=m.articulo_id
             LEFT JOIN usuarios u ON u.id=m.usuario_id
             WHERE ($1::date IS NULL OR m.creado_en::date >= $1) AND ($2::date IS NULL OR m.creado_en::date <= $2)
             ORDER BY m.id DESC LIMIT 5000`, params,
          );
          rows = result.rows.map((row) => Object.values(row));
          total = `${rows.length} movimientos`;
          break;
        }
      }

      const format = String(args.formato || "PDF").toUpperCase() === "EXCEL" ? "EXCEL" : "PDF";
      const dateSuffix = desde || hasta ? `-${desde || "inicio"}-${hasta || "hoy"}` : "";
      return {
        reportRequest: {
          title: definition.title,
          fileName: `${definition.file}${dateSuffix}`,
          format,
          columns: definition.columns,
          rows,
          total,
          period: desde || hasta ? `Período: ${desde || "inicio"} a ${hasta || "hoy"}` : "Reporte actual",
        },
      };
    },
  },
  crear_propietario: {
    declaration: {
      name: "crear_propietario",
      description: "Propone registrar un nuevo propietario o cliente del taller. El sistema pedirá confirmación al usuario antes de guardar.",
      parameters: {
        type: "OBJECT",
        properties: {
          nombre: { type: "STRING", description: "Nombre completo o razón social" },
          tipo: { type: "STRING", description: "INDIVIDUAL o EMPRESA" },
          nit: { type: "STRING" },
          telefono: { type: "STRING" },
          correo: { type: "STRING" },
          direccion: { type: "STRING" },
        },
        required: ["nombre"],
      },
    },
    async execute(user, args) {
      if (!hasPermission(user, "propietarios", "crear")) return { error: "No tienes permiso para registrar propietarios" };
      if (!args.telefono && !args.correo) return { error: "Se necesita al menos un teléfono o correo de contacto para registrar al propietario" };
      return {
        pendingAction: {
          type: "crear_propietario",
          summary: `Registrar propietario "${args.nombre}" (${args.tipo === "EMPRESA" ? "Empresa" : "Individual"}${args.telefono ? `, tel. ${args.telefono}` : ""}${args.correo ? `, ${args.correo}` : ""})`,
          payload: {
            nombre: args.nombre,
            tipo: args.tipo === "EMPRESA" ? "EMPRESA" : "INDIVIDUAL",
            nit: args.nit || null,
            telefono: args.telefono || null,
            correo: args.correo || null,
            direccion: args.direccion || null,
          },
        },
      };
    },
  },
  crear_articulo: {
    declaration: {
      name: "crear_articulo",
      description: "Propone registrar un nuevo artículo de inventario (repuesto o accesorio). El sistema pedirá confirmación antes de guardar.",
      parameters: {
        type: "OBJECT",
        properties: {
          nombre: { type: "STRING" },
          tipo: { type: "STRING", description: "REPUESTO o ACCESORIO" },
          categoria: { type: "STRING" },
          sku: { type: "STRING", description: "Código del artículo" },
          stock_minimo: { type: "NUMBER" },
        },
        required: ["nombre"],
      },
    },
    async execute(user, args) {
      if (!hasPermission(user, "inventario", "crear")) return { error: "No tienes permiso para registrar artículos" };
      return {
        pendingAction: {
          type: "crear_articulo",
          summary: `Registrar artículo "${args.nombre}" (${args.tipo === "ACCESORIO" ? "Accesorio" : "Repuesto"}${args.categoria ? `, ${args.categoria}` : ""}, stock mínimo ${Number(args.stock_minimo) || 0})`,
          payload: {
            nombre: args.nombre,
            tipo: args.tipo === "ACCESORIO" ? "ACCESORIO" : "REPUESTO",
            categoria: args.categoria || null,
            sku: args.sku || null,
            stock_minimo: Number(args.stock_minimo) || 0,
          },
        },
      };
    },
  },
  crear_orden: {
    declaration: {
      name: "crear_orden",
      description: "Propone crear una orden de servicio para un vehículo existente. El sistema pedirá confirmación antes de guardar.",
      parameters: {
        type: "OBJECT",
        properties: {
          placa: { type: "STRING", description: "Placa del vehículo, por ejemplo C-789DEF" },
          servicio: { type: "STRING", description: "Nombre del servicio del catálogo, por ejemplo Cambio de Aceite" },
          descripcion: { type: "STRING", description: "Descripción del trabajo a realizar" },
          fecha_proximo_servicio: { type: "STRING", description: "Fecha estimada del próximo servicio en formato AAAA-MM-DD" },
          kilometraje: { type: "INTEGER", description: "Kilometraje al ingreso" },
          prioridad: { type: "STRING", description: "BAJA, MEDIA o ALTA" },
        },
        required: ["placa", "servicio", "descripcion", "fecha_proximo_servicio"],
      },
    },
    async execute(user, args) {
      if (!hasPermission(user, "ordenes", "crear")) return { error: "No tienes permiso para crear órdenes" };
      if (clientOwnerId(user) !== null) return { error: "Los clientes no pueden crear órdenes desde el asistente" };
      const vehicle = await pool.query(
        "SELECT id, placa, marca, modelo, kilometraje_actual FROM vehiculos WHERE UPPER(placa) = UPPER($1)",
        [String(args.placa || "").trim()],
      );
      if (!vehicle.rowCount) return { error: `No existe un vehículo con placa ${args.placa}. Verifica la placa.` };
      const service = await pool.query(
        "SELECT id, nombre FROM servicios WHERE activo AND nombre ILIKE $1 ORDER BY nombre LIMIT 1",
        [`%${String(args.servicio || "").trim()}%`],
      );
      if (!service.rowCount) return { error: `No encontré el servicio "${args.servicio}" en el catálogo. Consulta los servicios disponibles.` };
      const v = vehicle.rows[0];
      const s = service.rows[0];
      return {
        pendingAction: {
          type: "crear_orden",
          summary: `Crear orden de "${s.nombre}" para ${v.marca} ${v.modelo} placa ${v.placa}, próximo servicio ${args.fecha_proximo_servicio}`,
          payload: {
            vehiculo_id: v.id,
            servicio_id: s.id,
            descripcion: args.descripcion,
            fecha_proximo_servicio: args.fecha_proximo_servicio,
            kilometraje: Number(args.kilometraje ?? v.kilometraje_actual) || 0,
            prioridad: ["BAJA", "ALTA"].includes(args.prioridad) ? args.prioridad : "MEDIA",
          },
        },
      };
    },
  },
};

const functionDeclarations = Object.values(tools).map((tool) => tool.declaration);

function systemPrompt(user) {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "Eres el asistente virtual de Taller Norte, un sistema de control de mantenimiento vehicular en Guatemala.",
    `La fecha de hoy es ${today}. El usuario actual tiene rol ${user.rol}.`,
    "Reglas:",
    "- Responde siempre en español, de forma breve, clara y con datos concretos obtenidos de las herramientas.",
    "- Nunca inventes placas, nombres, cifras ni fechas; si no hay datos, dilo.",
    "- Usa las herramientas de consulta para responder preguntas sobre el taller.",
    "- Cuando el usuario pida registrar o crear algo, usa la herramienta de acción correspondiente; el sistema pedirá su confirmación antes de guardar.",
    "- Los montos son en quetzales (Q) y las fechas en formato AAAA-MM-DD.",
    "- Si una herramienta indica falta de permiso o datos, explícalo amablemente y sugiere alternativas.",
  ].join("\n");
}

async function callGemini(user, contents) {
  const models = [...new Set([geminiModel, ...fallbackModels])];
  let lastError;
  for (const [index, model] of models.entries()) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt(user) }] },
          contents,
          tools: [{ functionDeclarations }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
        }),
      },
    );
    if (response.ok) return response.json();

    const detail = await response.text().catch(() => "");
    const retryable = response.status === 429 || response.status >= 500;
    lastError = Object.assign(new Error(`Gemini ${model} respondió ${response.status}: ${detail.slice(0, 250)}`), {
      statusCode: response.status === 429 ? 429 : 502,
      upstreamStatus: response.status,
      detail,
    });
    if (!retryable || index === models.length - 1) throw lastError;
    console.warn(`Gemini ${model} respondió ${response.status}; intentando modelo alternativo.`);
  }
  throw lastError;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "assistant-service", configured: Boolean(geminiKey) });
});

app.post("/api/asistente/chat", authenticateToken, async (req, res) => {
  if (!geminiKey) {
    return res.status(503).json({ error: "El asistente aún no está configurado. Agrega GEMINI_API_KEY en el archivo .env y reinicia los servicios." });
  }
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "Se requiere al menos un mensaje" });
  }

  const contents = messages.slice(-12).map((message) => ({
    role: message.role === "user" ? "user" : "model",
    parts: [{ text: String(message.text || "").slice(0, 4000) }],
  }));

  try {
    for (let step = 0; step < 5; step += 1) {
      const data = await callGemini(req.user, contents);
      const parts = data.candidates?.[0]?.content?.parts || [];
      const call = parts.find((part) => part.functionCall);

      if (!call) {
        const text = parts.map((part) => part.text || "").join("").trim();
        return res.json({ text: text || "No tengo una respuesta en este momento. Intenta reformular tu consulta." });
      }

      const { name, args } = call.functionCall;
      const tool = tools[name];
      if (!tool) return res.json({ text: "Esa consulta no está disponible en el asistente." });

      const result = await tool.execute(req.user, args || {});
      if (result.reportRequest) {
        return res.json({
          text: `Preparé el reporte de ${result.reportRequest.title} en formato ${result.reportRequest.format}. Descárgalo desde este mensaje.`,
          reportRequest: result.reportRequest,
        });
      }
      if (result.pendingAction) {
        return res.json({
          text: `Esta es la acción que preparé. Revisa los datos y confírmala para registrarla:`,
          pendingAction: result.pendingAction,
        });
      }

      contents.push({ role: "model", parts: [call] });
      contents.push({ role: "user", parts: [{ functionResponse: { name, response: { resultado: result } } }] });
    }
    return res.json({ text: "No pude completar la consulta. Intenta con una pregunta más específica." });
  } catch (error) {
    console.error("Assistant error:", error);
    if (error.statusCode === 502 && String(error.message).includes("denied access")) {
      return res.status(502).json({ error: "Google rechazó la API key de Gemini: el proyecto no tiene acceso. Genera una nueva clave en Google AI Studio (aistudio.google.com/apikey) y actualiza GEMINI_API_KEY en el archivo .env." });
    }
    if (error.upstreamStatus === 429) {
      return res.status(503).json({ error: "Se alcanzó temporalmente la cuota gratuita de Gemini. Espera un momento y vuelve a intentarlo." });
    }
    if (error.upstreamStatus >= 500) {
      return res.status(503).json({ error: "Gemini está temporalmente saturado. El sistema probó los modelos alternativos; vuelve a intentarlo en unos minutos." });
    }
    return res.status(error.statusCode || 500).json({ error: "El asistente no está disponible en este momento. Intenta más tarde." });
  }
});

const port = Number(process.env.PORT) || 3005;
app.listen(port, () => {
  console.log(`assistant-service escuchando en puerto ${port} (Gemini ${geminiKey ? "configurado" : "SIN API KEY"})`);
});
