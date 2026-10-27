const apiUrl = (name, fallback) => import.meta.env[name] || fallback;

export const apiConfig = {
  auth: apiUrl("VITE_AUTH_API", ""),
  vehicle: apiUrl("VITE_VEHICLE_API", ""),
  service: apiUrl("VITE_SERVICE_API", ""),
  order: apiUrl("VITE_ORDER_API", ""),
  assistant: apiUrl("VITE_ASSISTANT_API", ""),
  publicApp: apiUrl("VITE_PUBLIC_APP_URL", window.location.origin),
};
