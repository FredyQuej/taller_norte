import { apiConfig } from "../../config/api";
import { bearerHeaders, httpRequest } from "../../infrastructure/http/httpClient";

export const vehicleService = {
  listVehicles(token) {
    return httpRequest(`${apiConfig.vehicle}/api/vehiculos`, { headers: bearerHeaders(token) });
  },
  createVehicle(token, data) {
    return httpRequest(`${apiConfig.vehicle}/api/vehiculos`, { method: "POST", headers: bearerHeaders(token), body: JSON.stringify(data) });
  },
};
