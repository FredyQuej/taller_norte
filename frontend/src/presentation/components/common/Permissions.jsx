export function hasPermission(permissions, module, action, role) {
  if (!role) {
    try {
      role = JSON.parse(localStorage.getItem("taller_session") || "null")?.usuario?.rol;
    } catch {
      role = null;
    }
  }
  if (role === "ADMIN" || role === "SUPER_USUARIO") return true;
  return permissions?.[module]?.[action] === true;
}

export function showUnauthorized(setMessage) {
  setMessage("Usuario no autorizado");
}

export function PermissionAlert({ message }) {
  return message ? <div className="alert error permission-alert" role="alert">{message}</div> : null;
}
