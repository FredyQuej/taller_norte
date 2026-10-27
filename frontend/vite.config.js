import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    proxy: {
      "^/api/vehiculos/\\d+/historial$": "http://localhost:3004",
      "/api/auth": "http://localhost:3001",
      "/api/propietarios": "http://localhost:3002",
      "/api/vehiculos": "http://localhost:3002",
      "/api/servicios": "http://localhost:3003",
      "/api/ordenes-servicio": "http://localhost:3004",
      "/api/tickets": "http://localhost:3004",
      "/api/recordatorios-servicio": "http://localhost:3004",
      "/api/inventario": "http://localhost:3004",
      "/api/asistente": "http://localhost:3005",
    },
  },
});
