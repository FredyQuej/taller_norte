import { apiConfig } from "../../config/api";
import { bearerHeaders, httpRequest } from "../../infrastructure/http/httpClient";

export const vehicleService = {
  listVehicles(token) {
    return httpRequest(`${apiConfig.vehicle}/api/vehiculos`, { headers: bearerHeaders(token) });
  },
  createVehicle(token, data) {
    return httpRequest(`${apiConfig.vehicle}/api/vehiculos`, { method: "POST", headers: bearerHeaders(token), body: JSON.stringify(data) });
  },
  getVehicle(token, id) {
    return httpRequest(`${apiConfig.vehicle}/api/vehiculos/${id}`, { headers: bearerHeaders(token) });
  },
  updateVehicle(token, id, data) {
    return httpRequest(`${apiConfig.vehicle}/api/vehiculos/${id}`, { method: "PUT", headers: bearerHeaders(token), body: JSON.stringify(data) });
  },
  deleteVehicle(token, id) {
    return httpRequest(`${apiConfig.vehicle}/api/vehiculos/${id}`, { method: "DELETE", headers: bearerHeaders(token) });
  },
};
