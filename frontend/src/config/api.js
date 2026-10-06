const apiUrl = (name, fallback) => import.meta.env[name] || fallback;

export const apiConfig = {
  auth: apiUrl("VITE_AUTH_API", "http://localhost:3001"),
  vehicle: apiUrl("VITE_VEHICLE_API", "http://localhost:3002"),
  service: apiUrl("VITE_SERVICE_API", "http://localhost:3003"),
  order: apiUrl("VITE_ORDER_API", "http://localhost:3004"),
  publicApp: apiUrl("VITE_PUBLIC_APP_URL", window.location.origin),
};
