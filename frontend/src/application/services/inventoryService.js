import { apiConfig } from "../../config/api";
import { bearerHeaders, httpRequest } from "../../infrastructure/http/httpClient";

export const inventoryService = {
  listArticles(token, search = "") {
    const query = search ? `?buscar=${encodeURIComponent(search)}` : "";
    return httpRequest(`${apiConfig.order}/api/inventario/articulos${query}`, { headers: bearerHeaders(token) });
  },
  saveArticle(token, data, id) {
    return httpRequest(`${apiConfig.order}/api/inventario/articulos${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      headers: bearerHeaders(token),
      body: JSON.stringify(data),
    });
  },
  deleteArticle(token, id) {
    return httpRequest(`${apiConfig.order}/api/inventario/articulos/${id}`, { method: "DELETE", headers: bearerHeaders(token) });
  },
  listMovements(token) {
    return httpRequest(`${apiConfig.order}/api/inventario/movimientos`, { headers: bearerHeaders(token) });
  },
  createMovement(token, data) {
    return httpRequest(`${apiConfig.order}/api/inventario/movimientos`, {
      method: "POST",
      headers: bearerHeaders(token),
      body: JSON.stringify(data),
    });
  },
};
