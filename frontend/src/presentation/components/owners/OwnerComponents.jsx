import { useState } from "react";
import { Check, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { ownerService } from "../../../application/services/ownerService";
import { hasPermission, PermissionAlert, showUnauthorized } from "../common/Permissions";

export function OwnerForm({ token, initialData, onDone, onCancel }) {
  const [form, setForm] = useState({ tipo: initialData?.tipo || "INDIVIDUAL", nombre: initialData?.nombre || "", nit: initialData?.nit || "", telefono: initialData?.telefono || "", correo: initialData?.correo || "", direccion: initialData?.direccion || "", activo: initialData?.activo ?? true });
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const currentSession = JSON.parse(localStorage.getItem("taller_session") || "null");
    const action = initialData?.id ? "editar" : "crear";
    if (!hasPermission(currentSession?.usuario?.permisos, "propietarios", action, currentSession?.usuario?.rol)) return setError("Usuario no autorizado");
    try {
      if (initialData?.id) await ownerService.update(token, initialData.id, form);
      else await ownerService.create(token, form);
      onDone();
    } catch (requestError) { setError(requestError.message); }
  }
  return <form onSubmit={submit} className="stack-form"><div className="form-grid"><label>Tipo<select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="INDIVIDUAL">Individual</option><option value="EMPRESA">Empresa</option></select></label><label>Nombre completo<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label><label>NIT<input value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} placeholder="Ej. 1234567-8 o CF" /></label><label>Teléfono<input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label><label>Correo<input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} /></label><label className="wide">Dirección<input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></label>{initialData?.id && <label>Estado<select value={form.activo ? "true" : "false"} onChange={(e) => setForm({ ...form, activo: e.target.value === "true" })}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>}</div>{error && <div className="alert error">{error}</div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancelar</button><button className="button primary"><Check size={17} /> {initialData?.id ? "Guardar cambios" : "Guardar propietario"}</button></div></form>;
}

export function OwnerList({ items, search, setSearch, onAdd, permissions }) {
  const [message, setMessage] = useState("");
  const [editingOwner, setEditingOwner] = useState(null);
  const [viewingOwner, setViewingOwner] = useState(null);
  const currentSession = JSON.parse(localStorage.getItem("taller_session") || "null");
  const effectivePermissions = permissions || currentSession?.usuario?.permisos;
  const add = () => hasPermission(effectivePermissions, "propietarios", "crear", currentSession?.usuario?.rol) ? onAdd() : showUnauthorized(setMessage);
  const edit = (owner) => hasPermission(effectivePermissions, "propietarios", "editar", currentSession?.usuario?.rol) ? setEditingOwner(owner) : showUnauthorized(setMessage);
  const view = (owner) => hasPermission(effectivePermissions, "propietarios", "consultar", currentSession?.usuario?.rol) ? setViewingOwner(owner) : showUnauthorized(setMessage);
  async function remove(owner) {
    if (!hasPermission(effectivePermissions, "propietarios", "eliminar", currentSession?.usuario?.rol)) return showUnauthorized(setMessage);
    if (!window.confirm(`¿Eliminar al propietario ${owner.nombre}?`)) return;
    try { await ownerService.delete(currentSession.token, owner.id); window.location.reload(); }
    catch (error) { setMessage(error.message); }
  }
  const closeEdit = () => setEditingOwner(null);
  const refresh = () => window.location.reload();
  return <><section className="content"><PermissionAlert message={message} /><div className="section-toolbar"><div><p className="muted">Directorio de clientes</p><h2>Todos los propietarios</h2></div><button className="button primary" onClick={add}><Plus size={17} /> Nuevo propietario</button></div><div className="list-toolbar"><div className="search-box"><Search size={17} /><input placeholder="Buscar por nombre, correo..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><span className="result-count">{items.length} registros</span></div>{items.length === 0 ? <div className="empty"><div className="empty-icon"><UsersRound size={26} /></div><h3>No hay registros todavía</h3><p>Empieza agregando un propietario al sistema.</p><button className="button secondary" onClick={add}><Plus size={16} /> Crear registro</button></div> : <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>NIT</th><th>Contacto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.nombre}</strong><small>ID #{item.id}</small></td><td><span className="tag">{item.tipo}</span></td><td>{item.nit || "No registrado"}</td><td>{item.telefono || item.correo || "Sin contacto"}</td><td><span className="status"><i /> {item.activo === false ? "Inactivo" : "Activo"}</span></td><td><div className="modal-actions"><button className="button secondary" onClick={() => view(item)}>Ver</button><button className="button secondary" onClick={() => edit(item)}>Editar</button></div></td></tr>)}</tbody></table></div>}</section>{editingOwner && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeEdit()}><div className="modal"><div className="modal-header"><div><span className="eyebrow">DIRECTORIO DE CLIENTES</span><h3>Editar propietario</h3></div><button className="icon-button" onClick={closeEdit} aria-label="Cerrar">×</button></div><OwnerForm token={currentSession?.token} initialData={editingOwner} onDone={refresh} onCancel={closeEdit} /></div></div>}{viewingOwner && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setViewingOwner(null)}><div className="modal"><div className="modal-header"><div><span className="eyebrow">FICHA DEL PROPIETARIO</span><h3>{viewingOwner.nombre}</h3></div><button className="icon-button" onClick={() => setViewingOwner(null)} aria-label="Cerrar">×</button></div><div className="table-wrap"><table><tbody><tr><th>ID</th><td>{viewingOwner.id}</td></tr><tr><th>Tipo</th><td>{viewingOwner.tipo}</td></tr><tr><th>Nombre</th><td>{viewingOwner.nombre}</td></tr><tr><th>NIT</th><td>{viewingOwner.nit || "No registrado"}</td></tr><tr><th>Teléfono</th><td>{viewingOwner.telefono || "No registrado"}</td></tr><tr><th>Correo</th><td>{viewingOwner.correo || "No registrado"}</td></tr><tr><th>Dirección</th><td>{viewingOwner.direccion || "No registrada"}</td></tr><tr><th>Estado</th><td>{viewingOwner.activo === false ? "Inactivo" : "Activo"}</td></tr><tr><th>Creado</th><td>{viewingOwner.creado_en ? new Date(viewingOwner.creado_en).toLocaleString("es-GT") : "-"}</td></tr><tr><th>Actualizado</th><td>{viewingOwner.actualizado_en ? new Date(viewingOwner.actualizado_en).toLocaleString("es-GT") : "-"}</td></tr></tbody></table></div></div></div>}</>;
}
