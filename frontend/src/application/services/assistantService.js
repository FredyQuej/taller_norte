import { apiConfig } from "../../config/api";
import { bearerHeaders, httpRequest } from "../../infrastructure/http/httpClient";

export const assistantService = {
  chat(token, messages) {
    return httpRequest(`${apiConfig.assistant}/api/asistente/chat`, {
      method: "POST",
      headers: bearerHeaders(token),
      body: JSON.stringify({ messages }),
    });
  },
};
