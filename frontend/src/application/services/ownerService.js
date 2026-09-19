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
};
