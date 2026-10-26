import { apiConfig } from "../../config/api";
import { bearerHeaders, httpRequest } from "../../infrastructure/http/httpClient";

export const reminderService = {
  list(token) {
    return httpRequest(`${apiConfig.order}/api/recordatorios-servicio`, { headers: bearerHeaders(token) });
  },
};
