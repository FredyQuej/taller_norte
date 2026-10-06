# Frontend architecture

The frontend follows a layered architecture. React components remain the presentation layer, while API URLs, HTTP transport, persistence, and domain operations are kept outside the UI.

```text
src/
├── config/
│   └── api.js                         # Environment-based service URLs
├── infrastructure/
│   ├── http/
│   │   └── httpClient.js              # fetch wrapper and auth headers
│   └── storage/
│       └── sessionStorage.js          # browser session persistence
├── application/
│   └── services/
│       ├── authService.js              # authentication use cases
│       ├── ownerService.js              # owner use cases
│       ├── vehicleService.js            # vehicle use cases
│       ├── serviceService.js            # maintenance services use cases
│       └── orderService.js              # orders and vehicle history use cases
├── presentation/
│   └── components/
│       ├── common/Stat.jsx              # shared presentation component
│       ├── owners/OwnerComponents.jsx   # owner form and list
│       ├── vehicles/VehicleComponents.jsx # vehicle form, list, and history
│       ├── services/ServiceComponents.jsx # service form and catalog
│       └── orders/OrderComponents.jsx   # order form, list, and detail
├── main.jsx                            # composition root and current UI composition
└── styles.css                          # presentation styles
```

## Layer responsibilities

- **Config:** resolves environment variables and service endpoints.
- **Infrastructure:** knows how to communicate with HTTP and browser storage.
- **Application:** exposes domain operations without leaking URLs or `fetch` into React components.
- **Presentation:** renders screens and collects user input. It should call application services, not infrastructure directly.
- **Composition root:** `main.jsx` wires the session, services, and current screens together.

## Request flow

```text
React form or screen
        ↓
application service
        ↓
infrastructure HTTP client
        ↓
backend service API
```

The domain components are composed by `main.jsx`, while their data operations remain in the application services. This keeps the UI for each module separate without changing backend contracts or user flows.

## Role-based access

- **RECEPCIONISTA:** consulta propietarios, vehículos, servicios y órdenes; puede registrar órdenes nuevas.
- **ENCARGADO:** permisos operativos del recepcionista, además de crear y actualizar propietarios, vehículos y servicios, y actualizar órdenes.
- **SUPER_USUARIO:** todos los permisos operativos y administración de usuarios.
- **ADMIN:** administración de usuarios, asignación de roles y permisos operativos de administración.

User registration is available from the **Usuarios** module and is protected by the auth service. The backend validates the role on every protected operation; hiding navigation items in the frontend is only an additional usability layer.

Client self-registration has been removed from the login screen. Customers now receive a service ticket with a QR code. Scanning it opens `/?ticket=ID`, which calls the public status endpoint and shows only the order status, vehicle, service, and date. No customer account or login is required to consult the ticket.

Each user also stores a granular permission matrix for `propietarios`, `vehiculos`, `servicios`, `ordenes` and `usuarios`, with the actions `consultar`, `crear`, `editar` and `eliminar`. Administrators can customize this matrix when creating or editing a user. The selected permissions are included in the authentication token and enforced by the domain services.
