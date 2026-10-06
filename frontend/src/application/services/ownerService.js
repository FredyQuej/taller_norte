import { apiConfig } from "../../config/api";
import { bearerHeaders, httpRequest } from "../../infrastructure/http/httpClient";

export const ownerService = {
  list(token) {
    return httpRequest(`${apiConfig.vehicle}/api/propietarios`, { headers: bearerHeaders(token) });
  },
  create(token, data) {
    return httpRequest(`${apiConfig.vehicle}/api/propietarios`, {
      method: "POST",
      headers: bearerHeaders(token),
      body: JSON.stringify(data),
    });
  },
  update(token, id, data) {
    return httpRequest(`${apiConfig.vehicle}/api/propietarios/${id}`, {
      method: "PUT",
      headers: bearerHeaders(token),
      body: JSON.stringify(data),
    });
  },
  delete(token, id) {
    return httpRequest(`${apiConfig.vehicle}/api/propietarios/${id}`, { method: "DELETE", headers: bearerHeaders(token) });
  },
};
