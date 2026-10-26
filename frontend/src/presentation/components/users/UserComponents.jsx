import { useState } from "react";
import { Check, Pencil, Plus, UserPlus } from "lucide-react";
import { authService } from "../../../application/services/authService";
import { getSession } from "../../../infrastructure/storage/sessionStorage";

const roleLabels = {
  RECEPCIONISTA: "Recepcionista",
  ENCARGADO: "Encargado",
  SUPER_USUARIO: "Super Usuario",
  ADMIN: "Administrador",
  CLIENTE: "Cliente",
};

const permissionModules = [
  ["propietarios", "Propietarios"],
  ["vehiculos", "Vehículos"],
  ["servicios", "Servicios"],
  ["ordenes", "Órdenes de servicio"],
  ["inventario", "Inventario"],
  ["usuarios", "Usuarios"],
];
const permissionActions = ["consultar", "crear", "editar", "eliminar"];
const rolePermissions = {
  RECEPCIONISTA: { propietarios: { consultar: true }, vehiculos: { consultar: true }, servicios: { consultar: true }, ordenes: { consultar: true, crear: true }, inventario: { consultar: true } },
  ENCARGADO: { propietarios: { consultar: true, crear: true, editar: true }, vehiculos: { consultar: true, crear: true, editar: true }, servicios: { consultar: true, crear: true, editar: true }, ordenes: { consultar: true, crear: true, editar: true }, inventario: { consultar: true, crear: true, editar: true } },
  ADMIN: {},
  SUPER_USUARIO: {},
  CLIENTE: { ordenes: { consultar: true } },
};

function normalizePermissions(role, permissions) {
  const source = permissions || rolePermissions[role] || {};
  return Object.fromEntries(permissionModules.map(([module]) => [module, Object.fromEntries(permissionActions.map((action) => [action, source[module]?.[action] === true]))]));
}

function PermissionMatrix({ role, permissions, onChange }) {
  const allSelected = role === "ADMIN" || role === "SUPER_USUARIO";
  function toggle(module, action) {
    const next = normalizePermissions(role, permissions);
    next[module][action] = !next[module][action];
    onChange(next);
  }
  function toggleModule(module) {
    const next = normalizePermissions(role, permissions);
    const selected = permissionActions.every((action) => next[module][action]);
    permissionActions.forEach((action) => { next[module][action] = !selected; });
    onChange(next);
  }
  return <fieldset className="permissions-panel"><legend>Permisos del usuario</legend><p className="muted">Selecciona las acciones permitidas según sus responsabilidades.</p><div className="permission-table"><div className="permission-row permission-head"><span>Módulo</span>{permissionActions.map((action) => <span key={action}>{action}</span>)}</div>{permissionModules.map(([module, label]) => <div className="permission-row" key={module}><strong>{label}</strong>{permissionActions.map((action) => <label key={action}><input type="checkbox" checked={allSelected || permissions[module]?.[action] === true} disabled={allSelected} onChange={() => toggle(module, action)} /> <span className="sr-only">{action} {label}</span></label>)}</div>)}</div>{allSelected && <small>Los roles administrativos tienen todos los permisos habilitados.</small>}<button type="button" className="button ghost permission-toggle" onClick={() => permissionModules.forEach(([module]) => toggleModule(module))}>Alternar permisos por módulo</button></fieldset>;
}

export function UserForm({ token, initialData, onDone, onCancel }) {
  const [form, setForm] = useState({ nombre: initialData?.nombre || "", correo: initialData?.correo || "", password: "", rol: initialData?.rol || "RECEPCIONISTA", activo: initialData?.activo ?? true, permisos: normalizePermissions(initialData?.rol || "RECEPCIONISTA", initialData?.permisos) });
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    try { if (initialData?.id) await authService.updateUser(token, initialData.id, form); else await authService.registerUser(token, form); onDone(); } catch (requestError) { setError(requestError.message); }
  }
  function changeRole(event) { const rol = event.target.value; setForm({ ...form, rol, permisos: normalizePermissions(rol, rolePermissions[rol]) }); }
  return <form onSubmit={submit} className="stack-form"><div className="form-grid"><label>Nombre completo<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label><label>Correo electrónico<input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} required /></label><label>Contraseña {initialData?.id && <small>(opcional)</small>}<input type="password" minLength="8" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!initialData?.id} /></label><label>Rol<select value={form.rol} onChange={changeRole}><option value="RECEPCIONISTA">Recepcionista</option><option value="ENCARGADO">Encargado</option><option value="ADMIN">Administrador</option><option value="SUPER_USUARIO">Superadministrador</option><option value="CLIENTE">Cliente</option></select></label>{initialData?.id && <label>Estado<select value={form.activo ? "true" : "false"} onChange={(e) => setForm({ ...form, activo: e.target.value === "true" })}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>}</div><PermissionMatrix role={form.rol} permissions={form.permisos} onChange={(permisos) => setForm({ ...form, permisos })} />{error && <div className="alert error">{error}</div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancelar</button><button className="button primary"><Check size={17} /> {initialData?.id ? "Guardar cambios" : "Registrar usuario"}</button></div></form>;
}

export function UserList({ users, onAdd, onEdit }) {
  const [editingUser, setEditingUser] = useState(null);
  const session = getSession();
  function startEdit(user) { if (onEdit) onEdit(user); else setEditingUser(user); }
  function closeEdit() { setEditingUser(null); }
  return <><section className="content"><div className="welcome"><div><span className="eyebrow">ADMINISTRACIÓN</span><h2>Usuarios y roles</h2><p>Controla quién puede acceder y operar el taller.</p></div><div className="welcome-mark"><UserPlus size={55} strokeWidth={1.2} /></div></div><div className="section-toolbar"><div><p className="muted">Acceso al sistema</p><h2>Usuarios registrados</h2></div><button className="button primary" onClick={() => onAdd()}><Plus size={17} /> Nuevo usuario</button></div><div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{users.length === 0 ? <tr><td colSpan="5"><div className="empty"><h3>No hay usuarios</h3><p>Registra el primer usuario operativo.</p></div></td></tr> : users.map((user) => <tr key={user.id}><td><strong>{user.nombre}</strong><small>ID #{user.id}</small></td><td>{user.correo}</td><td><span className="tag">{roleLabels[user.rol] || user.rol}</span></td><td><span className="status"><i /> {user.activo ? "Activo" : "Inactivo"}</span></td><td><button className="button secondary" onClick={() => startEdit(user)}><Pencil size={15} /> Editar</button></td></tr>)}</tbody></table></div></section>{editingUser && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeEdit()}><div className="modal"><div className="modal-header"><div><span className="eyebrow">ADMINISTRACIÓN</span><h3>Editar usuario</h3></div><button className="icon-button" onClick={closeEdit} aria-label="Cerrar">×</button></div><UserForm token={session?.token} initialData={editingUser} onDone={() => window.location.reload()} onCancel={closeEdit} /></div></div>}</>;
}
