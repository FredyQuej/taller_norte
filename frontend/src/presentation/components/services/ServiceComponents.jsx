import { useEffect, useState } from "react";
import { Check, Plus, Trash2, Wrench } from "lucide-react";
import { serviceService } from "../../../application/services/serviceService";
import { hasPermission, PermissionAlert, showUnauthorized } from "../common/Permissions";

export function ServiceForm({ token, initialData, onDone, onCancel }) {
  const empty = { nombre: "", descripcion: "", precio: 0, activo: true };
  const [form, setForm] = useState({ ...empty, ...initialData, precio: initialData?.precio ?? 0 });
  const [error, setError] = useState("");
  useEffect(() => setForm({ ...empty, ...initialData, precio: initialData?.precio ?? 0 }), [initialData]);
  async function submit(event) { event.preventDefault(); const currentSession = JSON.parse(localStorage.getItem("taller_session") || "null"); const action = initialData?.id ? "editar" : "crear"; if (!hasPermission(currentSession?.usuario?.permisos, "servicios", action, currentSession?.usuario?.rol)) return setError("Usuario no autorizado"); try { await serviceService.save(token, { ...form, precio: Number(form.precio) }, initialData?.id); onDone(); } catch (requestError) { setError(requestError.message); } }
  return <form onSubmit={submit} className="stack-form"><div className="form-grid"><label className="wide">Nombre del servicio<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label><label className="wide">Descripción<textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows="3" /></label><label>Precio Q<input type="number" min="0" step="0.01" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} required /></label><label>Activo<select value={form.activo ? "true" : "false"} onChange={(e) => setForm({ ...form, activo: e.target.value === "true" })}><option value="true">Sí</option><option value="false">No</option></select></label></div>{error && <div className="alert error">{error}</div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancelar</button><button className="button primary"><Check size={17} /> {initialData?.id ? "Guardar cambios" : "Guardar servicio"}</button></div></form>;
}

export function ServiceCatalog({ services, onAdd: rawOnAdd, onEdit: rawOnEdit, permissions, onChanged }) {
  const effectivePermissions = permissions || JSON.parse(localStorage.getItem("taller_session") || "null")?.usuario?.permisos;
  const onAdd = () => hasPermission(effectivePermissions, "servicios", "crear") ? rawOnAdd() : window.alert("Usuario no autorizado");
  const onEdit = (service) => hasPermission(effectivePermissions, "servicios", "editar") ? rawOnEdit(service) : window.alert("Usuario no autorizado");
  async function remove(service) {
    if (!hasPermission(effectivePermissions, "servicios", "eliminar")) return window.alert("Usuario no autorizado");
    if (!window.confirm(`¿Eliminar el servicio ${service.nombre}?`)) return;
    try { const session = JSON.parse(localStorage.getItem("taller_session") || "null"); await serviceService.delete(session.token, service.id); onChanged?.(); }
    catch (error) { window.alert(error.message); }
  }
  return <section className="content"><div className="welcome"><div><span className="eyebrow">GESTIÓN DE SERVICIOS</span><h2>Catálogo de servicios</h2><p>Administra los servicios disponibles para el taller.</p></div><div className="welcome-mark"><Wrench size={55} strokeWidth={1.2} /></div></div><div className="section-toolbar"><div><p className="muted">Catálogo</p><h2>Servicios</h2></div><button className="button primary" onClick={onAdd}><Plus size={17} /> Nuevo servicio</button></div><div className="table-wrap"><table><thead><tr><th>Servicio</th><th>Descripción</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{services.length === 0 ? <tr><td colSpan="5"><div className="empty"><h3>No hay servicios aún</h3><p>Agrega el primer servicio del taller.</p></div></td></tr> : services.map((service) => <tr key={service.id}><td><strong>{service.nombre}</strong><small>ID #{service.id}</small></td><td>{service.descripcion || "Sin descripción"}</td><td>Q {Number(service.precio || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td><span className="status"><i /> {service.activo ? "Activo" : "Inactivo"}</span></td><td><div className="modal-actions"><button className="button secondary" onClick={() => onEdit(service)}>Editar</button><button className="button secondary" onClick={() => remove(service)} aria-label="Eliminar servicio"><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div></section>;
}
