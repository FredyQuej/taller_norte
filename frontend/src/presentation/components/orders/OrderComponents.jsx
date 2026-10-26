import { useEffect, useState } from "react";
import { CarFront, Check, Plus, ShieldCheck, Wrench } from "lucide-react";
import { orderService } from "../../../application/services/orderService";
import { inventoryService } from "../../../application/services/inventoryService";
import { Stat } from "../common/Stat";
import { hasPermission } from "../common/Permissions";

const orderStatusTransitions = {
  PENDIENTE: ["EN_PROCESO", "CANCELADO"],
  EN_PROCESO: ["COMPLETADO", "CANCELADO"],
  COMPLETADO: [],
  CANCELADO: [],
};
const orderStatusLabels = { PENDIENTE: "Pendiente", EN_PROCESO: "En proceso", COMPLETADO: "Completada", CANCELADO: "Cancelada" };

export function OrderForm({ token, vehicles, services, initialData, onDone, onCancel }) {
  const defaultVehicle = vehicles.find((vehicle) => String(vehicle.id) === String(initialData?.vehiculo_id)) || vehicles[0];
  const defaults = { vehiculo_id: defaultVehicle?.id || "", servicio_id: services[0]?.id || "", fecha_ingreso: new Date().toISOString().split("T")[0], fecha_proximo_servicio: "", descripcion: "", estado: "PENDIENTE", prioridad: "MEDIA", kilometraje: defaultVehicle?.kilometraje_actual ?? 0, costo: 0, observaciones: "" };
  const [form, setForm] = useState({ ...defaults, ...initialData, fecha_proximo_servicio: initialData?.fecha_proximo_servicio ? String(initialData.fecha_proximo_servicio).slice(0, 10) : "" });
  const [error, setError] = useState("");
  const [inventoryArticles, setInventoryArticles] = useState([]);
  const [articleLines, setArticleLines] = useState((initialData?.articulos || []).map((line) => ({ articulo_id: Number(line.articulo_id), cantidad: Number(line.cantidad), nombre: line.nombre, unidad: line.unidad || "unidad", precio_venta_unitario: Number(line.precio_venta_unitario || 0), stock_actual: Number(line.stock_actual ?? 0) })));
  const [articleToAdd, setArticleToAdd] = useState("");
  const [articleQuantity, setArticleQuantity] = useState(1);
  const statusOptions = initialData?.id ? [form.estado, ...(orderStatusTransitions[form.estado] || [])] : ["PENDIENTE"];
  useEffect(() => {
    const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === String(initialData?.vehiculo_id)) || vehicles[0];
    setForm({ ...defaults, ...initialData, vehiculo_id: initialData?.vehiculo_id || selectedVehicle?.id || "", servicio_id: initialData?.servicio_id || services[0]?.id || "", kilometraje: initialData?.kilometraje ?? selectedVehicle?.kilometraje_actual ?? 0, fecha_proximo_servicio: initialData?.fecha_proximo_servicio ? String(initialData.fecha_proximo_servicio).slice(0, 10) : "" });
    setArticleLines((initialData?.articulos || []).map((line) => ({ articulo_id: Number(line.articulo_id), cantidad: Number(line.cantidad), nombre: line.nombre, unidad: line.unidad || "unidad", precio_venta_unitario: Number(line.precio_venta_unitario || 0), stock_actual: Number(line.stock_actual ?? 0) })));
  }, [initialData, vehicles, services]);

  useEffect(() => {
    const currentSession = JSON.parse(localStorage.getItem("taller_session") || "null");
    if (!hasPermission(currentSession?.usuario?.permisos, "inventario", "consultar", currentSession?.usuario?.rol)) return;
    inventoryService.listArticles(token).then(setInventoryArticles).catch(() => setInventoryArticles([]));
  }, [token]);

  const currentSession = JSON.parse(localStorage.getItem("taller_session") || "null");
  const canConsumeInventory = hasPermission(currentSession?.usuario?.permisos, "inventario", "crear", currentSession?.usuario?.rol);

  function addArticle() {
    const currentSession = JSON.parse(localStorage.getItem("taller_session") || "null");
    if (!hasPermission(currentSession?.usuario?.permisos, "inventario", "crear", currentSession?.usuario?.rol)) return setError("Usuario no autorizado para consumir inventario");
    const article = inventoryArticles.find((item) => String(item.id) === String(articleToAdd));
    const quantity = Number(articleQuantity);
    if (!article || !Number.isFinite(quantity) || quantity <= 0) return setError("Selecciona un artículo y una cantidad válida");
    const existing = articleLines.find((line) => line.articulo_id === Number(article.id));
    const existingQuantity = existing?.cantidad || 0;
    const availableForOrder = Number(article.stock_actual) + (initialData?.id ? existingQuantity : 0);
    if (existingQuantity + quantity > availableForOrder) return setError(`Stock insuficiente. Disponible para esta orden: ${availableForOrder} ${article.unidad}`);
    setArticleLines((current) => existing
      ? current.map((line) => line.articulo_id === Number(article.id) ? { ...line, cantidad: line.cantidad + quantity } : line)
      : [...current, { articulo_id: Number(article.id), cantidad: quantity, nombre: article.nombre, unidad: article.unidad, precio_venta_unitario: Number(article.precio_venta), stock_actual: Number(article.stock_actual) }]);
    setError("");
  }

  function changeVehicle(event) {
    const vehiculo_id = event.target.value;
    const vehicle = vehicles.find((item) => String(item.id) === String(vehiculo_id));
    setForm({ ...form, vehiculo_id, kilometraje: vehicle?.kilometraje_actual ?? "" });
  }

  async function submit(event) {
    event.preventDefault();
    const currentSession = JSON.parse(localStorage.getItem("taller_session") || "null");
    const action = initialData?.id ? "editar" : "crear";
    if (!hasPermission(currentSession?.usuario?.permisos, "ordenes", action, currentSession?.usuario?.rol)) return setError("Usuario no autorizado");
    try {
      await orderService.save(token, { ...form, vehiculo_id: Number(form.vehiculo_id), servicio_id: Number(form.servicio_id), kilometraje: Number(form.kilometraje), costo: Number(form.costo), articulos: articleLines.map(({ articulo_id, cantidad }) => ({ articulo_id, cantidad })) }, initialData?.id);
      onDone();
    } catch (requestError) { setError(requestError.message); }
  }

  return <form onSubmit={submit} className="stack-form"><div className="form-grid">
    <label>Vehículo<select value={form.vehiculo_id} onChange={changeVehicle} required disabled={!vehicles.length}>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.placa} - {vehicle.marca} {vehicle.modelo}</option>)}</select></label>
    <label>Servicio<select value={form.servicio_id} onChange={(event) => setForm({ ...form, servicio_id: event.target.value })} required disabled={!services.length}>{services.map((service) => <option key={service.id} value={service.id}>{service.nombre}</option>)}</select></label>
    <label>Fecha de ingreso<input type="date" value={form.fecha_ingreso} onChange={(event) => setForm({ ...form, fecha_ingreso: event.target.value })} required /></label>
    <label>Fecha estimada del próximo servicio<input type="date" value={form.fecha_proximo_servicio} min={form.fecha_ingreso} onChange={(event) => setForm({ ...form, fecha_proximo_servicio: event.target.value })} required /></label>
    <label>Kilometraje al ingreso<input type="number" min="0" value={form.kilometraje} onChange={(event) => setForm({ ...form, kilometraje: event.target.value })} required /></label>
    <label>Estado<select value={form.estado} onChange={(event) => setForm({ ...form, estado: event.target.value })}>{statusOptions.map((status) => <option key={status} value={status}>{orderStatusLabels[status]}</option>)}</select></label>
    <label>Prioridad<select value={form.prioridad} onChange={(event) => setForm({ ...form, prioridad: event.target.value })}><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option></select></label>
    <label>Costo Q<input type="number" min="0" step="0.01" value={form.costo} onChange={(event) => setForm({ ...form, costo: event.target.value })} /></label>
    <label className="wide">Descripción<textarea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} rows="3" required /></label>
    <label className="wide">Observaciones<textarea value={form.observaciones} onChange={(event) => setForm({ ...form, observaciones: event.target.value })} rows="2" /></label>
  </div>
  <section className="wide">
    <div className="section-toolbar"><div><p className="muted">Repuestos y accesorios</p><h3>Artículos de la orden</h3></div><strong>Q {articleLines.reduce((total, line) => total + line.cantidad * line.precio_venta_unitario, 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
    {articleLines.length > 0 && <div className="table-wrap"><table><thead><tr><th>Artículo</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th>{canConsumeInventory && <th>Acción</th>}</tr></thead><tbody>{articleLines.map((line) => <tr key={line.articulo_id}><td>{line.nombre}</td><td>{line.cantidad} {line.unidad}</td><td>Q {line.precio_venta_unitario.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>Q {(line.cantidad * line.precio_venta_unitario).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>{canConsumeInventory && <td><button type="button" className="button ghost" onClick={() => setArticleLines((current) => current.filter((item) => item.articulo_id !== line.articulo_id))}>Quitar</button></td>}</tr>)}</tbody></table></div>}
    {canConsumeInventory && <div className="form-grid"><label>Artículo<select value={articleToAdd} onChange={(event) => setArticleToAdd(event.target.value)}><option value="">Seleccionar artículo</option>{inventoryArticles.filter((article) => article.activo).map((article) => { const existingQuantity = articleLines.find((line) => line.articulo_id === Number(article.id))?.cantidad || 0; const available = Number(article.stock_actual) + (initialData?.id ? existingQuantity : 0); return <option key={article.id} value={article.id} disabled={available <= 0}>{article.sku} - {article.nombre} (disp. {available})</option>; })}</select></label><label>Cantidad<input type="number" min="0.01" step="0.01" value={articleQuantity} onChange={(event) => setArticleQuantity(event.target.value)} /></label><div className="form-actions"><button type="button" className="button secondary" onClick={addArticle} disabled={!articleToAdd}><Plus size={16} /> Agregar artículo</button></div></div>}
  </section>
  {error && <div className="alert error">{error}</div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={!vehicles.length || !services.length}><Check size={17} /> {initialData?.id ? "Guardar cambios" : "Guardar orden"}</button></div></form>;
}

export function OrderList({ orders, vehicles, services, filters, onFiltersChange, onAdd: rawOnAdd, onDetail: rawOnDetail, onEdit: rawOnEdit, onTicket: rawOnTicket, permissions, readOnly = false }) {
  const filtered = orders.filter((order) => (filters.estado === "TODOS" || order.estado === filters.estado) && (filters.vehiculo === "TODOS" || String(order.vehiculo_id) === filters.vehiculo));
  const effectivePermissions = permissions || JSON.parse(localStorage.getItem("taller_session") || "null")?.usuario?.permisos;
  const onAdd = () => hasPermission(effectivePermissions, "ordenes", "crear") ? rawOnAdd() : window.alert("Usuario no autorizado");
  const onDetail = (order) => hasPermission(effectivePermissions, "ordenes", "consultar") ? rawOnDetail(order) : window.alert("Usuario no autorizado");
  const onTicket = (order) => hasPermission(effectivePermissions, "ordenes", "consultar") ? rawOnTicket(order) : window.alert("Usuario no autorizado");
  const onEdit = (order) => hasPermission(effectivePermissions, "ordenes", "editar") ? rawOnEdit(order) : window.alert("Usuario no autorizado");
  return <section className="content"><div className="welcome"><div><span className="eyebrow">{readOnly ? "CONSULTA DE CLIENTE" : "GESTIÓN DE ÓRDENES"}</span><h2>{readOnly ? "Mis servicios" : "Órdenes de servicio"}</h2><p>{readOnly ? "Consulta el estado y el historial de tus servicios." : "Registra y consulta cada trabajo solicitado por vehículo."}</p></div><div className="welcome-mark"><ShieldCheck size={55} strokeWidth={1.2} /></div></div><div className="stat-grid"><Stat icon={CarFront} label="Vehículos" value={vehicles.length} /><Stat icon={Wrench} label="Servicios" value={services.length || "Consulta"} /><Stat icon={ShieldCheck} label="Órdenes" value={filtered.length} accent /></div>{!readOnly && <div className="section-toolbar"><div><p className="muted">Operación</p><h2>Órdenes</h2></div><button className="button primary" onClick={onAdd}><Plus size={17} /> Nueva orden</button></div>}<div className="list-toolbar"><div className="search-box"><label>Estado<select value={filters.estado} onChange={(e) => onFiltersChange({ ...filters, estado: e.target.value })}><option value="TODOS">Todos</option><option value="PENDIENTE">Pendiente</option><option value="EN_PROCESO">En proceso</option><option value="COMPLETADO">Completado</option><option value="CANCELADO">Cancelado</option></select></label></div>{!readOnly && <div className="search-box"><label>Vehículo<select value={filters.vehiculo} onChange={(e) => onFiltersChange({ ...filters, vehiculo: e.target.value })}><option value="TODOS">Todos</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={String(vehicle.id)}>{vehicle.placa} - {vehicle.marca} {vehicle.modelo}</option>)}</select></label></div>}</div><div className="table-wrap"><table><thead><tr><th>Orden</th><th>Vehículo</th><th>Servicio</th><th>Fecha</th><th>Prioridad</th><th>Estado</th><th>Costo</th><th>Acciones</th></tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan="8"><div className="empty"><h3>No hay órdenes aún</h3><p>El historial asociado a tu cuenta aparecerá aquí.</p></div></td></tr> : filtered.map((order) => <tr key={order.id}><td><strong>OS-{String(order.id).padStart(4, "0")}</strong><small>{order.descripcion}</small></td><td><strong>{order.marca} {order.modelo}</strong><small>{order.placa}</small></td><td>{order.servicio}</td><td>{order.fecha_ingreso}</td><td><span className="tag">{order.prioridad}</span></td><td><span className="status"><i /> {order.estado}</span></td><td>Q {Number(order.costo || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td><div className="modal-actions"><button className="button secondary" onClick={() => onDetail(order)}>Detalle</button><button className="button secondary" onClick={() => window.open(`${window.location.origin}/?ticket=${order.id}`, "_blank", "noopener,noreferrer")}>Ticket QR</button>{!readOnly && <button className="button secondary" onClick={() => onEdit(order)}>Editar</button>}</div></td></tr>)}</tbody></table></div></section>;
}

export function OrderDetail({ order, onBack, onEdit, onTicket }) {
  return <section className="content"><div className="section-toolbar"><div><p className="muted">Detalle</p><h2>Orden de servicio #{order.id}</h2></div><div className="modal-actions"><button className="button ghost" onClick={onBack}>Volver</button><button className="button primary" onClick={() => onEdit(order)}>Editar orden</button></div></div><div className="stat-grid"><Stat icon={CarFront} label="Vehículo" value={`${order.marca} ${order.modelo}`} accent /><Stat icon={Wrench} label="Servicio" value={order.servicio} /><Stat icon={ShieldCheck} label="Estado" value={order.estado} /></div><div className="table-wrap"><table><tbody><tr><th>Placa</th><td>{order.placa}</td></tr><tr><th>Propietario</th><td>{order.propietario}</td></tr><tr><th>Fecha ingreso</th><td>{String(order.fecha_ingreso).slice(0, 10)}</td></tr><tr><th>Kilometraje al ingreso</th><td>{Number(order.kilometraje || 0).toLocaleString("es-GT")} km</td></tr><tr><th>Próximo servicio estimado</th><td>{order.fecha_proximo_servicio ? String(order.fecha_proximo_servicio).slice(0, 10) : "No estimada"}</td></tr><tr><th>Prioridad</th><td>{order.prioridad}</td></tr><tr><th>Mano de obra/servicio</th><td>Q {Number(order.costo || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr><tr><th>Descripción</th><td>{order.descripcion}</td></tr><tr><th>Observaciones</th><td>{order.observaciones || "Sin observaciones"}</td></tr></tbody></table></div><div className="section-toolbar"><div><p className="muted">Inventario consumido</p><h3>Artículos</h3></div></div><div className="table-wrap"><table><thead><tr><th>Artículo</th><th>SKU</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>{(order.articulos || []).length ? order.articulos.map((line) => <tr key={line.articulo_id}><td>{line.nombre}</td><td>{line.sku || "—"}</td><td>{line.cantidad} {line.unidad}</td><td>Q {Number(line.precio_venta_unitario).toFixed(2)}</td><td>Q {Number(line.subtotal).toFixed(2)}</td></tr>) : <tr><td colSpan="5">No se agregaron artículos</td></tr>}<tr><th colSpan="4">Total de la orden</th><th>Q {Number(order.costo_total ?? order.costo ?? 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</th></tr></tbody></table></div></section>;
}
