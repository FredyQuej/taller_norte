import { useState } from "react";
import { Check, Plus, Search, UsersRound } from "lucide-react";
import { ownerService } from "../../../application/services/ownerService";

export function OwnerForm({ token, onDone, onCancel }) {
  const [form, setForm] = useState({ tipo: "INDIVIDUAL", nombre: "", telefono: "", correo: "", direccion: "" });
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    try { await ownerService.create(token, form); onDone(); } catch (requestError) { setError(requestError.message); }
  }
  return <form onSubmit={submit} className="stack-form"><div className="form-grid"><label>Tipo<select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="INDIVIDUAL">Individual</option><option value="EMPRESA">Empresa</option></select></label><label>Nombre completo<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label><label>Teléfono<input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label><label>Correo<input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} /></label><label className="wide">Dirección<input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></label></div>{error && <div className="alert error">{error}</div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancelar</button><button className="button primary"><Check size={17} /> Guardar propietario</button></div></form>;
}

export function OwnerList({ items, search, setSearch, onAdd }) {
  return <section className="content"><div className="section-toolbar"><div><p className="muted">Directorio de clientes</p><h2>Todos los propietarios</h2></div><button className="button primary" onClick={onAdd}><Plus size={17} /> Nuevo propietario</button></div><div className="list-toolbar"><div className="search-box"><Search size={17} /><input placeholder="Buscar por nombre, correo..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><span className="result-count">{items.length} registros</span></div>{items.length === 0 ? <div className="empty"><div className="empty-icon"><UsersRound size={26} /></div><h3>No hay registros todavía</h3><p>Empieza agregando un propietario al sistema.</p><button className="button secondary" onClick={onAdd}><Plus size={16} /> Crear registro</button></div> : <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>Contacto</th><th>Estado</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.nombre}</strong><small>ID #{item.id}</small></td><td><span className="tag">{item.tipo}</span></td><td>{item.telefono || item.correo || "Sin contacto"}</td><td><span className="status"><i /> Activo</span></td></tr>)}</tbody></table></div>}</section>;
}
