import { apiConfig } from "../../config/api";
import { bearerHeaders, httpRequest } from "../../infrastructure/http/httpClient";

export const orderService = {
  getPublicTicket(id) {
    return httpRequest(`${apiConfig.order}/api/tickets/${id}/status`);
  },
  list(token) {
    return httpRequest(`${apiConfig.order}/api/ordenes-servicio`, { headers: bearerHeaders(token) });
  },
  getVehicleHistory(token, vehicleId) {
    return httpRequest(`${apiConfig.order}/api/vehiculos/${vehicleId}/historial`, { headers: bearerHeaders(token) });
  },
  save(token, data, id) {
    return httpRequest(`${apiConfig.order}/api/ordenes-servicio${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      headers: bearerHeaders(token),
      body: JSON.stringify(data),
    });
  },
  updateStatus(token, id, estado) {
    return httpRequest(`${apiConfig.order}/api/ordenes-servicio/${id}/estado`, {
      method: "PATCH",
      headers: bearerHeaders(token),
      body: JSON.stringify({ estado }),
    });
  },
  delete(token, id) {
    return httpRequest(`${apiConfig.order}/api/ordenes-servicio/${id}`, { method: "DELETE", headers: bearerHeaders(token) });
  },
};
