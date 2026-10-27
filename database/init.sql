CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
  id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(30) NOT NULL UNIQUE CHECK (nombre IN ('RECEPCIONISTA','ENCARGADO','ADMIN','SUPER_USUARIO','CLIENTE'))
);

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rol_id SMALLINT NOT NULL REFERENCES roles(id),
  nombre VARCHAR(120) NOT NULL,
  correo VARCHAR(160) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  permisos JSONB NOT NULL DEFAULT '{}'::jsonb,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS propietarios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('INDIVIDUAL','EMPRESA')),
  nombre VARCHAR(150) NOT NULL,
  nit VARCHAR(30),
  telefono VARCHAR(25),
  correo VARCHAR(160),
  direccion VARCHAR(250),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT propietario_contacto_chk CHECK (telefono IS NOT NULL OR correo IS NOT NULL)
);

ALTER TABLE propietarios ADD COLUMN IF NOT EXISTS nit VARCHAR(30);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS propietario_id BIGINT REFERENCES propietarios(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permisos JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS vehiculos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  propietario_id BIGINT NOT NULL REFERENCES propietarios(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  tipo VARCHAR(30) NOT NULL,
  marca VARCHAR(60) NOT NULL,
  modelo VARCHAR(60) NOT NULL,
  anio SMALLINT NOT NULL CHECK (anio BETWEEN 1900 AND 2100),
  placa VARCHAR(20) NOT NULL,
  kilometraje_actual INTEGER NOT NULL DEFAULT 0 CHECK (kilometraje_actual >= 0),
  estado VARCHAR(30) NOT NULL DEFAULT 'ACTIVO',
  observaciones TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehiculos_placa_upper ON vehiculos (UPPER(placa));
CREATE INDEX IF NOT EXISTS idx_vehiculos_propietario ON vehiculos(propietario_id);

CREATE TABLE IF NOT EXISTS servicios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  precio NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio >= 0),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ordenes_servicio (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehiculo_id BIGINT NOT NULL REFERENCES vehiculos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  servicio_id BIGINT NOT NULL REFERENCES servicios(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  fecha_ingreso DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_proximo_servicio DATE,
  descripcion TEXT NOT NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','EN_PROCESO','COMPLETADO','CANCELADO')),
  prioridad VARCHAR(20) NOT NULL DEFAULT 'MEDIA' CHECK (prioridad IN ('BAJA','MEDIA','ALTA')),
  kilometraje INTEGER NOT NULL DEFAULT 0 CHECK (kilometraje >= 0),
  costo NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (costo >= 0),
  observaciones TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ordenes_servicio ADD COLUMN IF NOT EXISTS fecha_proximo_servicio DATE;

CREATE TABLE IF NOT EXISTS inventario_articulos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku VARCHAR(60) UNIQUE,
  nombre VARCHAR(150) NOT NULL,
  categoria VARCHAR(80),
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('REPUESTO','ACCESORIO')),
  descripcion TEXT,
  unidad VARCHAR(30) NOT NULL DEFAULT 'unidad',
  stock_actual NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  precio_compra NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_compra >= 0),
  precio_venta NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_venta >= 0),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventario_articulos ADD COLUMN IF NOT EXISTS categoria VARCHAR(80);

CREATE TABLE IF NOT EXISTS ordenes_articulos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orden_servicio_id BIGINT NOT NULL REFERENCES ordenes_servicio(id) ON UPDATE CASCADE ON DELETE CASCADE,
  articulo_id BIGINT NOT NULL REFERENCES inventario_articulos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  precio_venta_unitario NUMERIC(12,2) NOT NULL CHECK (precio_venta_unitario >= 0),
  precio_compra_unitario NUMERIC(12,2) NOT NULL CHECK (precio_compra_unitario >= 0),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  articulo_id BIGINT NOT NULL REFERENCES inventario_articulos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  usuario_id BIGINT REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL,
  orden_servicio_id BIGINT REFERENCES ordenes_servicio(id) ON UPDATE CASCADE ON DELETE SET NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA','CONSUMO_ORDEN')),
  cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  costo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  referencia VARCHAR(120),
  observaciones TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_articulos_orden ON ordenes_articulos(orden_servicio_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_articulo ON movimientos_inventario(articulo_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS compras_inventario (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_factura VARCHAR(60) NOT NULL,
  proveedor VARCHAR(150),
  usuario_id BIGINT REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL,
  total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  observaciones TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compras_inventario_detalle (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  compra_id BIGINT NOT NULL REFERENCES compras_inventario(id) ON UPDATE CASCADE ON DELETE CASCADE,
  articulo_id BIGINT NOT NULL REFERENCES inventario_articulos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  costo_compra NUMERIC(12,2) NOT NULL CHECK (costo_compra >= 0),
  precio_venta NUMERIC(12,2) NOT NULL CHECK (precio_venta >= 0),
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE IF NOT EXISTS ventas_inventario (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id BIGINT REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL,
  total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  observaciones TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ventas_inventario_detalle (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venta_id BIGINT NOT NULL REFERENCES ventas_inventario(id) ON UPDATE CASCADE ON DELETE CASCADE,
  articulo_id BIGINT NOT NULL REFERENCES inventario_articulos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  precio_venta NUMERIC(12,2) NOT NULL CHECK (precio_venta >= 0),
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS compra_id BIGINT REFERENCES compras_inventario(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS venta_id BIGINT REFERENCES ventas_inventario(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_compras_inventario_fecha ON compras_inventario(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_inventario_fecha ON ventas_inventario(creado_en DESC);

CREATE TABLE IF NOT EXISTS recordatorios_servicio (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orden_servicio_id BIGINT NOT NULL REFERENCES ordenes_servicio(id) ON UPDATE CASCADE ON DELETE CASCADE,
  canal VARCHAR(20) NOT NULL CHECK (canal IN ('EMAIL','WHATSAPP')),
  fecha_proximo_servicio DATE NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ENVIADO','ERROR')),
  intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  error TEXT,
  ultimo_intento_en TIMESTAMPTZ,
  enviado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (orden_servicio_id, canal, fecha_proximo_servicio)
);

CREATE INDEX IF NOT EXISTS idx_ordenes_servicio_vehiculo ON ordenes_servicio(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_servicio_servicio ON ordenes_servicio(servicio_id);

INSERT INTO roles(nombre) VALUES ('RECEPCIONISTA'), ('ENCARGADO'), ('ADMIN'), ('SUPER_USUARIO'), ('CLIENTE') ON CONFLICT DO NOTHING;
INSERT INTO usuarios(rol_id,nombre,correo,password_hash)
SELECT r.id,'Administrador','admin@local.test',crypt('Admin123*',gen_salt('bf'))
FROM roles r WHERE r.nombre='SUPER_USUARIO'
ON CONFLICT (correo) DO NOTHING;
