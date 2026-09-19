import { apiConfig } from "../../config/api";
import { httpRequest } from "../../infrastructure/http/httpClient";

export const authService = {
  login(credentials) {
    return httpRequest(`${apiConfig.auth}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  },
  registerPublic(data) {
    return httpRequest(`${apiConfig.auth}/api/auth/register-public`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  listUsers(token) {
    return httpRequest(`${apiConfig.auth}/api/auth/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  registerUser(token, data) {
    return httpRequest(`${apiConfig.auth}/api/auth/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },
};
