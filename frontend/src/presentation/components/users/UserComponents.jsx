import { useState } from "react";
import { Check, Plus, UserPlus } from "lucide-react";
import { authService } from "../../../application/services/authService";

const roleLabels = {
  RECEPCIONISTA: "Recepcionista",
  ENCARGADO: "Encargado",
  SUPER_USUARIO: "Super Usuario",
};

export function UserForm({ token, onDone, onCancel }) {
  const [form, setForm] = useState({ nombre: "", correo: "", password: "", rol: "RECEPCIONISTA" });
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    try { await authService.registerUser(token, form); onDone(); } catch (requestError) { setError(requestError.message); }
  }
  return <form onSubmit={submit} className="stack-form"><div className="form-grid"><label>Nombre completo<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label><label>Correo electrónico<input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} required /></label><label>Contraseña<input type="password" minLength="8" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label><label>Rol<select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}><option value="RECEPCIONISTA">Recepcionista</option><option value="ENCARGADO">Encargado</option><option value="SUPER_USUARIO">Super Usuario</option></select></label></div>{error && <div className="alert error">{error}</div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancelar</button><button className="button primary"><Check size={17} /> Registrar usuario</button></div></form>;
}

export function UserList({ users, onAdd }) {
  return <section className="content"><div className="welcome"><div><span className="eyebrow">ADMINISTRACIÓN</span><h2>Usuarios y roles</h2><p>Controla quién puede acceder y operar el taller.</p></div><div className="welcome-mark"><UserPlus size={55} strokeWidth={1.2} /></div></div><div className="section-toolbar"><div><p className="muted">Acceso al sistema</p><h2>Usuarios registrados</h2></div><button className="button primary" onClick={onAdd}><Plus size={17} /> Nuevo usuario</button></div><div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead><tbody>{users.length === 0 ? <tr><td colSpan="4"><div className="empty"><h3>No hay usuarios</h3><p>Registra el primer usuario operativo.</p></div></td></tr> : users.map((user) => <tr key={user.id}><td><strong>{user.nombre}</strong><small>ID #{user.id}</small></td><td>{user.correo}</td><td><span className="tag">{roleLabels[user.rol] || user.rol}</span></td><td><span className="status"><i /> {user.activo ? "Activo" : "Inactivo"}</span></td></tr>)}</tbody></table></div></section>;
}
