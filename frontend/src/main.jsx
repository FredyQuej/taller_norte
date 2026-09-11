import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import {
  CarFront,
  Check,
  ChevronRight,
  CircleUserRound,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import "./styles.css";

const AUTH_API = import.meta.env.VITE_AUTH_API || "http://localhost:3001";
const VEHICLE_API = import.meta.env.VITE_VEHICLE_API || "http://localhost:3002";
const SERVICE_API = import.meta.env.VITE_SERVICE_API || "http://localhost:3003";
const ORDER_API = import.meta.env.VITE_ORDER_API || "http://localhost:3004";

function formatCurrentDate() {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No se pudo completar la solicitud");
  return data;
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ correo: "admin@local.test", password: "Admin123*" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await request(`${AUTH_API}/api/auth/login`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      onLogin(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-aside">
        <div className="brand brand-light"><Wrench size={19} /> TALLER NORTE</div>
        <div className="login-hero-copy">
          <span className="eyebrow">CONTROL DE MANTENIMIENTO</span>
          <h1>Todo el taller,<br /><em>en movimiento.</em></h1>
          <p>Una vista clara para cuidar cada vehículo, cada propietario y cada visita.</p>
        </div>
        <div className="aside-footer"><ShieldCheck size={16} /> Datos protegidos en tu operación diaria</div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="mobile-brand brand"><Wrench size={19} /> TALLER NORTE</div>
          <span className="eyebrow">BIENVENIDO DE VUELTA</span>
          <h2>Entra a tu espacio<br />de trabajo.</h2>
          <p className="muted">Usa tus credenciales para continuar.</p>
          <form onSubmit={submit} className="stack-form">
            <label>Correo electrónico<input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} required /></label>
            <label>Contraseña<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
            {error && <div className="alert error">{error}</div>}
            <button className="button primary full" disabled={loading}>{loading ? "Ingresando..." : "Ingresar al panel"}<ChevronRight size={18} /></button>
          </form>
          <p className="login-hint">Acceso inicial: <strong>admin@local.test</strong></p>
        </div>
      </section>
    </main>
  );
}

function Modal({ title, onClose, children }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-header"><div><span className="eyebrow">NUEVO REGISTRO</span><h3>{title}</h3></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button></div>{children}</div></div>;
}

function OwnerForm({ token, onDone, onCancel }) {
  const [form, setForm] = useState({ tipo: "INDIVIDUAL", nombre: "", telefono: "", correo: "", direccion: "" });
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    try {
      await request(`${VEHICLE_API}/api/propietarios`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(form) });
      onDone();
    } catch (requestError) { setError(requestError.message); }
  }
  return <form onSubmit={submit} className="stack-form"><div className="form-grid"><label>Tipo<select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="INDIVIDUAL">Individual</option><option value="EMPRESA">Empresa</option></select></label><label>Nombre completo<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label><label>Teléfono<input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label><label>Correo<input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} /></label><label className="wide">Dirección<input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></label></div>{error && <div className="alert error">{error}</div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancelar</button><button className="button primary"><Check size={17} /> Guardar propietario</button></div></form>;
}

function VehicleForm({ token, owners, onDone, onCancel }) {
  const [form, setForm] = useState({ propietario_id: owners[0]?.id || "", tipo: "Automóvil", marca: "", modelo: "", anio: new Date().getFullYear(), placa: "", kilometraje_actual: 0, estado: "ACTIVO", observaciones: "" });
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    try {
      await request(`${VEHICLE_API}/api/vehiculos`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...form, propietario_id: Number(form.propietario_id), anio: Number(form.anio), kilometraje_actual: Number(form.kilometraje_actual) }) });
      onDone();
    } catch (requestError) { setError(requestError.message); }
  }
  return <form onSubmit={submit} className="stack-form"><div className="form-grid"><label className="wide">Propietario<select value={form.propietario_id} onChange={(e) => setForm({ ...form, propietario_id: e.target.value })} required>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.nombre}</option>)}</select></label><label>Tipo<input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} required /></label><label>Marca<input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} required /></label><label>Modelo<input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} required /></label><label>Año<input type="number" min="1900" max="2100" value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })} required /></label><label>Placa<input value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })} required /></label><label>Kilometraje<input type="number" min="0" value={form.kilometraje_actual} onChange={(e) => setForm({ ...form, kilometraje_actual: e.target.value })} /></label><label className="wide">Observaciones<input value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></label></div>{error && <div className="alert error">{error}</div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancelar</button><button className="button primary"><Check size={17} /> Guardar vehículo</button></div></form>;
}

function ServiceForm({ token, initialData, onDone, onCancel }) {
  const [form, setForm] = useState({
    nombre: initialData?.nombre || "",
    descripcion: initialData?.descripcion || "",
    precio: initialData?.precio ?? 0,
    activo: initialData?.activo ?? true,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      nombre: initialData?.nombre || "",
      descripcion: initialData?.descripcion || "",
      precio: initialData?.precio ?? 0,
      activo: initialData?.activo ?? true,
    });
  }, [initialData]);

  async function submit(event) {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        precio: Number(form.precio),
      };
      const url = initialData?.id ? `${SERVICE_API}/api/servicios/${initialData.id}` : `${SERVICE_API}/api/servicios`;
      const method = initialData?.id ? "PUT" : "POST";
      await request(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      onDone();
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <form onSubmit={submit} className="stack-form">
      <div className="form-grid">
        <label className="wide">Nombre del servicio<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label>
        <label className="wide">Descripción<textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows="3" /></label>
        <label>Precio Q<input type="number" min="0" step="0.01" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} required /></label>
        <label>Activo<select value={form.activo ? "true" : "false"} onChange={(e) => setForm({ ...form, activo: e.target.value === "true" })}><option value="true">Sí</option><option value="false">No</option></select></label>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancelar</button><button className="button primary"><Check size={17} /> {initialData?.id ? "Guardar cambios" : "Guardar servicio"}</button></div>
    </form>
  );
}

function ServiceOrderForm({ token, vehicles, services, initialData, onDone, onCancel }) {
  const [form, setForm] = useState({
    vehiculo_id: initialData?.vehiculo_id || vehicles[0]?.id || "",
    servicio_id: initialData?.servicio_id || services[0]?.id || "",
    fecha_ingreso: initialData?.fecha_ingreso || new Date().toISOString().split("T")[0],
    descripcion: initialData?.descripcion || "",
    estado: initialData?.estado || "PENDIENTE",
    prioridad: initialData?.prioridad || "MEDIA",
    kilometraje: initialData?.kilometraje ?? 0,
    costo: initialData?.costo ?? 0,
    observaciones: initialData?.observaciones || "",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      vehiculo_id: initialData?.vehiculo_id || vehicles[0]?.id || "",
      servicio_id: initialData?.servicio_id || services[0]?.id || "",
      fecha_ingreso: initialData?.fecha_ingreso || new Date().toISOString().split("T")[0],
      descripcion: initialData?.descripcion || "",
      estado: initialData?.estado || "PENDIENTE",
      prioridad: initialData?.prioridad || "MEDIA",
      kilometraje: initialData?.kilometraje ?? 0,
      costo: initialData?.costo ?? 0,
      observaciones: initialData?.observaciones || "",
    });
  }, [initialData, vehicles, services]);

  async function submit(event) {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        vehiculo_id: Number(form.vehiculo_id),
        servicio_id: Number(form.servicio_id),
        kilometraje: Number(form.kilometraje),
        costo: Number(form.costo),
      };
      const url = initialData?.id ? `${ORDER_API}/api/ordenes-servicio/${initialData.id}` : `${ORDER_API}/api/ordenes-servicio`;
      const method = initialData?.id ? "PUT" : "POST";
      await request(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      onDone();
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <form onSubmit={submit} className="stack-form">
      <div className="form-grid">
        <label>Vehículo<select value={form.vehiculo_id} onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })} required disabled={vehicles.length === 0}>
          {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.placa} - {vehicle.marca} {vehicle.modelo}</option>)}
        </select></label>
        <label>Servicio<select value={form.servicio_id} onChange={(e) => setForm({ ...form, servicio_id: e.target.value })} required disabled={services.length === 0}>
          {services.map((service) => <option key={service.id} value={service.id}>{service.nombre}</option>)}
        </select></label>
        <label>Fecha de ingreso<input type="date" value={form.fecha_ingreso} onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })} required /></label>
        <label>Estado<select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}><option value="PENDIENTE">Pendiente</option><option value="EN_PROCESO">En proceso</option><option value="COMPLETADO">Completado</option><option value="CANCELADO">Cancelado</option></select></label>
        <label>Prioridad<select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option></select></label>
        <label>Kilometraje<input type="number" min="0" value={form.kilometraje} onChange={(e) => setForm({ ...form, kilometraje: e.target.value })} /></label>
        <label>Costo Q<input type="number" min="0" step="0.01" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} /></label>
        <label className="wide">Descripción<textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows="3" required /></label>
        <label className="wide">Observaciones<textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} rows="2" /></label>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={vehicles.length === 0 || services.length === 0}><Check size={17} /> {initialData?.id ? "Guardar cambios" : "Guardar orden"}</button></div>
    </form>
  );
}

function ServicesSection({ services, onAddService, onEditService }) {
  return (
    <section className="content">
      <div className="welcome">
        <div>
          <span className="eyebrow">GESTIÓN DE SERVICIOS</span>
          <h2>Catálogo de servicios</h2>
          <p>Administra los servicios disponibles para el taller.</p>
        </div>
        <div className="welcome-mark"><Wrench size={55} strokeWidth={1.2} /></div>
      </div>

      <div className="section-toolbar">
        <div>
          <p className="muted">Catálogo</p>
          <h2>Servicios</h2>
        </div>
        <button className="button primary" onClick={onAddService}><Plus size={17} /> Nuevo servicio</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Descripción</th>
              <th>Precio</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <tr><td colSpan="5"><div className="empty"><h3>No hay servicios aún</h3><p>Agrega el primer servicio del taller.</p></div></td></tr>
            ) : services.map((service) => (
              <tr key={service.id}>
                <td><strong>{service.nombre}</strong><small>ID #{service.id}</small></td>
                <td>{service.descripcion || "Sin descripción"}</td>
                <td>Q {Number(service.precio || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td><span className="status"><i /> {service.activo ? "Activo" : "Inactivo"}</span></td>
                <td><button className="button secondary" onClick={() => onEditService(service)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrdersSection({ orders, vehicles, services, filters, onFiltersChange, onAddOrder, onDetailOrder, onEditOrder }) {
  const filteredOrders = orders.filter((order) => {
    const matchesEstado = filters.estado === "TODOS" || order.estado === filters.estado;
    const matchesVehiculo = filters.vehiculo === "TODOS" || String(order.vehiculo_id) === filters.vehiculo;
    return matchesEstado && matchesVehiculo;
  });

  return (
    <section className="content">
      <div className="welcome">
        <div>
          <span className="eyebrow">GESTIÓN DE ÓRDENES</span>
          <h2>Órdenes de servicio</h2>
          <p>Registra y consulta cada trabajo solicitado por vehículo.</p>
        </div>
        <div className="welcome-mark"><ShieldCheck size={55} strokeWidth={1.2} /></div>
      </div>

      <div className="stat-grid">
        <Stat icon={CarFront} label="Vehículos activos" value={vehicles.length} />
        <Stat icon={Wrench} label="Servicios disponibles" value={services.length} />
        <Stat icon={ShieldCheck} label="Órdenes registradas" value={filteredOrders.length} accent />
      </div>

      <div className="section-toolbar">
        <div>
          <p className="muted">Operación</p>
          <h2>Órdenes</h2>
        </div>
        <button className="button primary" onClick={onAddOrder}><Plus size={17} /> Nueva orden</button>
      </div>

      <div className="list-toolbar">
        <div className="search-box">
          <label>Estado
            <select value={filters.estado} onChange={(e) => onFiltersChange({ ...filters, estado: e.target.value })}>
              <option value="TODOS">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_PROCESO">En proceso</option>
              <option value="COMPLETADO">Completado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </label>
        </div>
        <div className="search-box">
          <label>Vehículo
            <select value={filters.vehiculo} onChange={(e) => onFiltersChange({ ...filters, vehiculo: e.target.value })}>
              <option value="TODOS">Todos</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={String(vehicle.id)}>{vehicle.placa} - {vehicle.marca} {vehicle.modelo}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Orden</th>
              <th>Vehículo</th>
              <th>Servicio</th>
              <th>Fecha</th>
              <th>Prioridad</th>
              <th>Estado</th>
              <th>Costo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr><td colSpan="8"><div className="empty"><h3>No hay órdenes aún</h3><p>Registra una orden o cambia los filtros.</p></div></td></tr>
            ) : filteredOrders.map((order) => (
              <tr key={order.id}>
                <td><strong>OS-{String(order.id).padStart(4, "0")}</strong><small>{order.descripcion}</small></td>
                <td><strong>{order.marca} {order.modelo}</strong><small>{order.placa}</small></td>
                <td>{order.servicio}</td>
                <td>{order.fecha_ingreso}</td>
                <td><span className="tag">{order.prioridad}</span></td>
                <td><span className="status"><i /> {order.estado}</span></td>
                <td>Q {Number(order.costo || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>
                  <div className="modal-actions">
                    <button className="button secondary" onClick={() => onDetailOrder(order)}>Detalle</button>
                    <button className="button secondary" onClick={() => onEditOrder(order)}>Editar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrderDetailSection({ order, onBack, onEdit }) {
  return (
    <section className="content">
      <div className="section-toolbar">
        <div>
          <p className="muted">Detalle</p>
          <h2>Orden de servicio #{order.id}</h2>
        </div>
        <div className="modal-actions">
          <button className="button ghost" onClick={onBack}>Volver</button>
          <button className="button primary" onClick={() => onEdit(order)}>Editar orden</button>
        </div>
      </div>

      <div className="stat-grid">
        <Stat icon={CarFront} label="Vehículo" value={`${order.marca} ${order.modelo}`} accent />
        <Stat icon={Wrench} label="Servicio" value={order.servicio} />
        <Stat icon={ShieldCheck} label="Estado" value={order.estado} />
      </div>

      <div className="table-wrap">
        <table>
          <tbody>
            <tr><th>Placa</th><td>{order.placa}</td></tr>
            <tr><th>Propietario</th><td>{order.propietario}</td></tr>
            <tr><th>Fecha ingreso</th><td>{order.fecha_ingreso}</td></tr>
            <tr><th>Prioridad</th><td>{order.prioridad}</td></tr>
            <tr><th>Kilometraje</th><td>{Number(order.kilometraje || 0).toLocaleString("es-GT")} km</td></tr>
            <tr><th>Costo</th><td>Q {Number(order.costo || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
            <tr><th>Descripción</th><td>{order.descripcion}</td></tr>
            <tr><th>Observaciones</th><td>{order.observaciones || "Sin observaciones"}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function App({ session, onLogout }) {
  const [active, setActive] = useState("overview");
  const [owners, setOwners] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [services, setServices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState("");
  const [modalData, setModalData] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderFilters, setOrderFilters] = useState({ estado: "TODOS", vehiculo: "TODOS" });
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  async function loadData() {
    try {
      const headers = { Authorization: `Bearer ${session.token}` };
      const [ownerData, vehicleData, serviceData, orderData] = await Promise.all([
        request(`${VEHICLE_API}/api/propietarios`, { headers }),
        request(`${VEHICLE_API}/api/vehiculos`, { headers }),
        request(`${SERVICE_API}/api/servicios`, { headers }),
        request(`${ORDER_API}/api/ordenes-servicio`, { headers }),
      ]);
      setOwners(ownerData);
      setVehicles(vehicleData);
      setServices(serviceData);
      setOrders(orderData);
      setError("");
    } catch (requestError) { setError(requestError.message); }
  }
  useEffect(() => { loadData(); }, []);

  const filteredOwners = owners.filter((owner) => `${owner.nombre} ${owner.correo || ""} ${owner.telefono || ""}`.toLowerCase().includes(search.toLowerCase()));
  const filteredVehicles = vehicles.filter((vehicle) => `${vehicle.placa} ${vehicle.marca} ${vehicle.modelo} ${vehicle.propietario || ""}`.toLowerCase().includes(search.toLowerCase()));
  const nav = [{ id: "overview", label: "Resumen", icon: Wrench }, { id: "owners", label: "Propietarios", icon: UsersRound }, { id: "vehicles", label: "Vehículos", icon: CarFront }, { id: "services", label: "Servicios", icon: Wrench }, { id: "orders", label: "Órdenes", icon: ShieldCheck }];
  const title = active === "overview" ? "Resumen operativo" : active === "owners" ? "Propietarios" : active === "vehicles" ? "Vehículos" : active === "services" ? "Servicios" : active === "order-detail" ? "Detalle de orden" : "Órdenes";

  function changeSection(id) {
    setActive(id);
    setSearch("");
    setMenuOpen(false);
    if (id !== "order-detail") {
      setSelectedOrder(null);
    }
  }

  function openServiceModal(service = null) {
    setModal("service");
    setModalData(service);
  }

  function openOrderModal(order = null) {
    setModal("order");
    setModalData(order);
  }

  function modalDone() {
    setModal("");
    setModalData(null);
    loadData();
  }

  return <div className="app-shell"><aside className={`sidebar ${menuOpen ? "open" : ""}`}><div className="brand"><Wrench size={19} /> TALLER NORTE</div><div className="side-label">OPERACIÓN</div><nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? "active" : ""} onClick={() => changeSection(id)}><Icon size={18} />{label}{active === id && <ChevronRight size={15} className="nav-arrow" />}</button>)}</nav><div className="sidebar-bottom"><div className="user-card"><div className="avatar"><CircleUserRound size={20} /></div><div><strong>{session.usuario.nombre}</strong><span>{session.usuario.rol}</span></div></div><button className="logout" onClick={onLogout}><LogOut size={16} /> Cerrar sesión</button></div></aside><main className="main-content"><header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button><div><span className="eyebrow">{formatCurrentDate()}</span><h1>{title}</h1></div><div className="topbar-user"><span>Sesión activa</span><div className="avatar small"><UserRound size={17} /></div></div></header>{error && <div className="alert error page-alert">{error}</div>}{active === "overview" && <Overview owners={owners} vehicles={vehicles} onSection={changeSection} />} {active === "owners" && <ResourceSection type="owners" items={filteredOwners} search={search} setSearch={setSearch} onAdd={() => setModal("owner")} />} {active === "vehicles" && <ResourceSection type="vehicles" items={filteredVehicles} search={search} setSearch={setSearch} onAdd={() => setModal("vehicle")} />} {active === "services" && <ServicesSection services={services} onAddService={() => openServiceModal()} onEditService={openServiceModal} />} {active === "orders" && <OrdersSection orders={orders} vehicles={vehicles} services={services} filters={orderFilters} onFiltersChange={setOrderFilters} onAddOrder={() => openOrderModal()} onDetailOrder={(order) => { setSelectedOrder(order); setActive("order-detail"); }} onEditOrder={openOrderModal} />} {active === "order-detail" && selectedOrder && <OrderDetailSection order={selectedOrder} onBack={() => changeSection("orders")} onEdit={openOrderModal} />}</main>{modal === "owner" && <Modal title="Registrar propietario" onClose={() => setModal("")}><OwnerForm token={session.token} onDone={modalDone} onCancel={() => setModal("")} /></Modal>}{modal === "vehicle" && <Modal title="Registrar vehículo" onClose={() => setModal("")}><VehicleForm token={session.token} owners={owners} onDone={modalDone} onCancel={() => setModal("")} /></Modal>}{modal === "service" && <Modal title={modalData?.id ? "Editar servicio" : "Registrar servicio"} onClose={() => { setModal(""); setModalData(null); }}><ServiceForm token={session.token} initialData={modalData} onDone={modalDone} onCancel={() => { setModal(""); setModalData(null); }} /></Modal>}{modal === "order" && <Modal title={modalData?.id ? "Editar orden de servicio" : "Registrar orden de servicio"} onClose={() => { setModal(""); setModalData(null); }}><ServiceOrderForm token={session.token} vehicles={vehicles} services={services} initialData={modalData} onDone={modalDone} onCancel={() => { setModal(""); setModalData(null); }} /></Modal>}</div>;
}

function Overview({ owners, vehicles, onSection }) {
  return <section className="content"><div className="welcome"><div><span className="eyebrow">PANEL DE CONTROL</span><h2>El pulso del taller, <em>al día.</em></h2><p>Consulta tus registros y mantén la operación ordenada.</p></div><div className="welcome-mark"><Wrench size={55} strokeWidth={1.2} /></div></div><div className="stat-grid"><Stat icon={UsersRound} label="Propietarios registrados" value={owners.length} /><Stat icon={CarFront} label="Vehículos en control" value={vehicles.length} /><Stat icon={ShieldCheck} label="Estado del sistema" value="Activo" accent /></div><div className="quick-grid"><QuickCard icon={UsersRound} title="Propietarios" detail="Registra y consulta clientes del taller." count={`${owners.length} registrados`} onClick={() => onSection("owners")} /><QuickCard icon={CarFront} title="Vehículos" detail="Mantén placas, kilometraje y estado al día." count={`${vehicles.length} registrados`} onClick={() => onSection("vehicles")} /></div></section>;
}
function Stat({ icon: Icon, label, value, accent }) { return <div className={`stat ${accent ? "accent" : ""}`}><div className="stat-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong></div></div>; }
function QuickCard({ icon: Icon, title, detail, count, onClick }) { return <button className="quick-card" onClick={onClick}><div className="quick-icon"><Icon size={21} /></div><div className="quick-copy"><h3>{title}</h3><p>{detail}</p><span>{count}</span></div><ChevronRight className="quick-arrow" size={19} /></button>; }
function ResourceSection({ type, items, search, setSearch, onAdd }) { const isOwners = type === "owners"; return <section className="content"><div className="section-toolbar"><div><p className="muted">{isOwners ? "Directorio de clientes" : "Inventario de unidades"}</p><h2>{isOwners ? "Todos los propietarios" : "Todos los vehículos"}</h2></div><button className="button primary" onClick={onAdd}><Plus size={17} /> {isOwners ? "Nuevo propietario" : "Nuevo vehículo"}</button></div><div className="list-toolbar"><div className="search-box"><Search size={17} /><input placeholder={isOwners ? "Buscar por nombre, correo..." : "Buscar por placa, marca, propietario..."} value={search} onChange={(e) => setSearch(e.target.value)} /></div><span className="result-count">{items.length} registros</span></div>{items.length === 0 ? <div className="empty"><div className="empty-icon">{isOwners ? <UsersRound size={26} /> : <CarFront size={26} />}</div><h3>No hay registros todavía</h3><p>Empieza agregando {isOwners ? "un propietario" : "un vehículo"} al sistema.</p><button className="button secondary" onClick={onAdd}><Plus size={16} /> Crear registro</button></div> : <div className="table-wrap"><table><thead><tr>{isOwners ? <><th>Nombre</th><th>Tipo</th><th>Contacto</th><th>Estado</th></> : <><th>Vehículo</th><th>Propietario</th><th>Placa</th><th>Kilometraje</th><th>Estado</th></>}</tr></thead><tbody>{items.map((item) => isOwners ? <tr key={item.id}><td><strong>{item.nombre}</strong><small>ID #{item.id}</small></td><td><span className="tag">{item.tipo}</span></td><td>{item.telefono || item.correo || "Sin contacto"}</td><td><span className="status"><i /> Activo</span></td></tr> : <tr key={item.id}><td><strong>{item.marca} {item.modelo}</strong><small>{item.tipo} · {item.anio}</small></td><td>{item.propietario}</td><td><span className="plate">{item.placa}</span></td><td>{Number(item.kilometraje_actual).toLocaleString("es-GT")} km</td><td><span className="status"><i /> {item.estado}</span></td></tr>)}</tbody></table></div>}</section>; }

function Root() { const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem("taller_session")); } catch { return null; } }); function login(data) { localStorage.setItem("taller_session", JSON.stringify(data)); setSession(data); } function logout() { localStorage.removeItem("taller_session"); setSession(null); } return session ? <App session={session} onLogout={logout} /> : <Login onLogin={login} />; }

createRoot(document.getElementById("root")).render(<Root />);
