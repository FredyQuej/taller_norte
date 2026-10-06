import { useState } from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { authService } from "../../application/services/authService";
import { orderService } from "../../application/services/orderService";
import { ownerService } from "../../application/services/ownerService";
import { serviceService } from "../../application/services/serviceService";
import { hasPermission, PermissionAlert, showUnauthorized } from "./common/Permissions";
import { OwnerForm } from "./owners/OwnerComponents";
import { ServiceForm } from "./services/ServiceComponents";
import { UserForm } from "./users/UserComponents";

function sessionInfo() {
  try { return JSON.parse(localStorage.getItem("taller_session") || "null"); } catch { return null; }
}

function checkedAction(module, action, callback, setMessage) {
  const session = sessionInfo();
  if (!hasPermission(session?.usuario?.permisos, module, action, session?.usuario?.rol)) {
    showUnauthorized(setMessage);
    return false;
  }
  callback?.();
  return true;
}

function EditModal({ title, children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-header"><h3>{title}</h3><button className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></div>{children}</div></div>;
}

export function OwnerList({ items, search, setSearch, onAdd }) {
  const [message, setMessage] = useState("");
  const [editOwner, setEditOwner] = useState(null);
  const [viewOwner, setViewOwner] = useState(null);
  const session = sessionInfo();
  async function remove(owner) {
    if (!checkedAction("propietarios", "eliminar", null, setMessage) || !window.confirm(`¿Eliminar a ${owner.nombre}?`)) return;
    try { await ownerService.delete(session.token, owner.id); window.location.reload(); } catch (error) { setMessage(error.message); }
  }
  return <><section className="content"><PermissionAlert message={message} /><div className="section-toolbar"><div><p className="muted">Directorio de clientes</p><h2>Todos los propietarios</h2></div><button className="button primary" onClick={() => checkedAction("propietarios", "crear", onAdd, setMessage)}><Plus size={17} /> Nuevo propietario</button></div><div className="list-toolbar"><input placeholder="Buscar por nombre, correo..." value={search} onChange={(event) => setSearch(event.target.value)} /><span className="result-count">{items.length} registros</span></div><div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>NIT</th><th>Contacto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.nombre}</strong><small>ID #{item.id}</small></td><td>{item.tipo}</td><td>{item.nit || "No registrado"}</td><td>{item.telefono || item.correo || "Sin contacto"}</td><td>{item.activo === false ? "Inactivo" : "Activo"}</td><td><div className="modal-actions"><button className="button secondary" onClick={() => checkedAction("propietarios", "consultar", () => setViewOwner(item), setMessage)} aria-label="Ver propietario"><Eye size={15} /></button><button className="button secondary" onClick={() => checkedAction("propietarios", "editar", () => setEditOwner(item), setMessage)} aria-label="Editar propietario"><Pencil size={15} /></button><button className="button secondary" onClick={() => remove(item)} aria-label="Eliminar propietario"><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div></section>{editOwner && <EditModal title="Editar propietario" onClose={() => setEditOwner(null)}><OwnerForm token={session?.token} initialData={editOwner} onDone={() => window.location.reload()} onCancel={() => setEditOwner(null)} /></EditModal>}{viewOwner && <EditModal title="Información del propietario" onClose={() => setViewOwner(null)}><div className="table-wrap"><table><tbody>{[["Tipo", viewOwner.tipo], ["Nombre", viewOwner.nombre], ["NIT", viewOwner.nit], ["Teléfono", viewOwner.telefono], ["Correo", viewOwner.correo], ["Dirección", viewOwner.direccion], ["Estado", viewOwner.activo === false ? "Inactivo" : "Activo"], ["Creado", viewOwner.creado_en], ["Actualizado", viewOwner.actualizado_en]].map(([label, value]) => <tr key={label}><th>{label}</th><td>{value || "No registrado"}</td></tr>)}</tbody></table></div></EditModal>}</>;
}

export function ServiceCatalog({ services, onAdd, onEdit }) {
  const [message, setMessage] = useState("");
  const session = sessionInfo();
  async function remove(service) {
    if (!checkedAction("servicios", "eliminar", null, setMessage) || !window.confirm(`¿Eliminar el servicio ${service.nombre}?`)) return;
    try { await serviceService.delete(session.token, service.id); window.location.reload(); } catch (error) { setMessage(error.message); }
  }
  return <section className="content"><PermissionAlert message={message} /><div className="section-toolbar"><h2>Catálogo de servicios</h2><button className="button primary" onClick={() => checkedAction("servicios", "crear", onAdd, setMessage)}><Plus size={17} /> Nuevo servicio</button></div><div className="table-wrap"><table><thead><tr><th>Servicio</th><th>Descripción</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{services.map((item) => <tr key={item.id}><td>{item.nombre}</td><td>{item.descripcion || "Sin descripción"}</td><td>Q {Number(item.precio).toFixed(2)}</td><td>{item.activo ? "Activo" : "Inactivo"}</td><td><div className="modal-actions"><button className="button secondary" onClick={() => checkedAction("servicios", "editar", () => onEdit(item), setMessage)}><Pencil size={15} /></button><button className="button secondary" onClick={() => remove(item)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div></section>;
}

export function OrderList({ orders, vehicles, services, filters, onFiltersChange, onAdd, onDetail, onEdit, onTicket, readOnly = false }) {
  const [message, setMessage] = useState("");
  const session = sessionInfo();
  const filtered = orders.filter((item) => (filters.estado === "TODOS" || item.estado === filters.estado) && (filters.vehiculo === "TODOS" || String(item.vehiculo_id) === filters.vehiculo));
  async function remove(order) {
    if (!checkedAction("ordenes", "eliminar", null, setMessage) || !window.confirm(`¿Eliminar la orden OS-${String(order.id).padStart(4, "0")}?`)) return;
    try { await orderService.delete(session.token, order.id); window.location.reload(); } catch (error) { setMessage(error.message); }
  }
  return <section className="content"><PermissionAlert message={message} /><div className="section-toolbar"><h2>{readOnly ? "Mis servicios" : "Órdenes de servicio"}</h2>{!readOnly && <button className="button primary" onClick={() => checkedAction("ordenes", "crear", onAdd, setMessage)}><Plus size={17} /> Nueva orden</button>}</div><div className="list-toolbar"><label>Estado<select value={filters.estado} onChange={(event) => onFiltersChange({ ...filters, estado: event.target.value })}><option value="TODOS">Todos</option>{["PENDIENTE", "EN_PROCESO", "COMPLETADO", "CANCELADO"].map((state) => <option key={state}>{state}</option>)}</select></label>{!readOnly && <label>Vehículo<select value={filters.vehiculo} onChange={(event) => onFiltersChange({ ...filters, vehiculo: event.target.value })}><option value="TODOS">Todos</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={String(vehicle.id)}>{vehicle.placa}</option>)}</select></label>}</div><div className="table-wrap"><table><thead><tr><th>Orden</th><th>Vehículo</th><th>Servicio</th><th>Fecha</th><th>Estado</th><th>Costo</th><th>Acciones</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td>OS-{String(item.id).padStart(4, "0")}</td><td>{item.marca} {item.modelo} · {item.placa}</td><td>{item.servicio}</td><td>{item.fecha_ingreso}</td><td>{item.estado}</td><td>Q {Number(item.costo).toFixed(2)}</td><td><div className="modal-actions"><button className="button secondary" onClick={() => checkedAction("ordenes", "consultar", () => onDetail(item), setMessage)}>Detalle</button><button className="button secondary" onClick={() => checkedAction("ordenes", "consultar", () => onTicket ? onTicket(item) : window.open(`${window.location.origin}/?ticket=${item.id}`, "_blank", "noopener,noreferrer"), setMessage)}>Ticket PDF / QR</button>{!readOnly && <><button className="button secondary" onClick={() => checkedAction("ordenes", "editar", () => onEdit(item), setMessage)}>Editar</button><button className="button secondary" onClick={() => remove(item)} aria-label="Eliminar orden"><Trash2 size={15} /></button></>}</div></td></tr>)}</tbody></table></div></section>;
}

export function UserList({ users, onAdd, onEdit }) {
  const [message, setMessage] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const session = sessionInfo();
  function edit(user) {
    if (!checkedAction("usuarios", "editar", null, setMessage)) return;
    if (onEdit) onEdit(user); else setEditingUser(user);
  }
  async function remove(user) {
    if (!checkedAction("usuarios", "eliminar", null, setMessage) || !window.confirm(`¿Eliminar el usuario ${user.nombre}?`)) return;
    try { await authService.deleteUser(session.token, user.id); window.location.reload(); } catch (error) { setMessage(error.message); }
  }
  return <><section className="content"><PermissionAlert message={message} /><div className="section-toolbar"><h2>Usuarios registrados</h2><button className="button primary" onClick={() => checkedAction("usuarios", "crear", onAdd, setMessage)}><Plus size={17} /> Nuevo usuario</button></div><div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.nombre}</td><td>{user.correo}</td><td>{user.rol}</td><td>{user.activo ? "Activo" : "Inactivo"}</td><td><div className="modal-actions"><button className="button secondary" onClick={() => edit(user)}><Pencil size={15} /></button><button className="button secondary" onClick={() => remove(user)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div></section>{editingUser && <EditModal title="Editar usuario" onClose={() => setEditingUser(null)}><UserForm token={session.token} initialData={editingUser} onDone={() => window.location.reload()} onCancel={() => setEditingUser(null)} /></EditModal>}</>;
}
