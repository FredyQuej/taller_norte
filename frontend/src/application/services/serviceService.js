import { apiConfig } from "../../config/api";
import { bearerHeaders, httpRequest } from "../../infrastructure/http/httpClient";

export const serviceService = {
  list(token) {
    return httpRequest(`${apiConfig.service}/api/servicios`, { headers: bearerHeaders(token) });
  },
  save(token, data, id) {
    return httpRequest(`${apiConfig.service}/api/servicios${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      headers: bearerHeaders(token),
      body: JSON.stringify(data),
    });
  },
};
