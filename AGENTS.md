# newSignWithEsp — Document Digital Signature System

## Project Overview

Full-stack web application for managing document digital signatures with NCALayer (Kazakhstan National CA) integration. Users create documents, assign signers, track signature workflows, and generate signed PDFs with QR codes and signature stamps.

## Architecture

- **Backend** (`server/`): Strapi v5 headless CMS (TypeScript), REST API on port 1337
- **Frontend** (`client/`): React 19 SPA with Vite 7, Tailwind CSS 4, on port 5173
- **Database**: SQLite (dev, `.tmp/data.db`), supports MySQL/PostgreSQL for production
- **Auth**: JWT-based, token in localStorage, Bearer header for API requests

## Tech Stack

| Layer    | Technologies                                        |
|----------|-----------------------------------------------------|
| Backend  | Strapi 5, Node.js >=20, TypeScript 5                |
| Frontend | React 19, Vite 7, Tailwind CSS 4, Axios, React Router 7 |
| PDF      | pdf-lib, @pdf-lib/fontkit, qrcode                   |
| Signing  | NCALayer (WebSocket wss://127.0.0.1:13579), PKCS#12, CMS |
| Icons    | lucide-react                                        |

## Key Commands

```bash
# Backend
cd server && npm run dev       # development with auto-reload (port 1337)
cd server && npm run build     # build admin panel
cd server && npm run start     # production mode

# Frontend
cd client && npm run dev       # development (port 5173)
cd client && npm run build     # production build
cd client && npm run lint      # ESLint
```

## Project Structure

```
server/
├── config/            # Strapi config (database, middlewares, server, plugins)
├── src/api/
│   ├── document/      # Document content type, controller, routes, services
│   ├── document-type/ # Document type classification
│   └── department/    # Department management
├── src/extensions/users-permissions/  # Extended user schema (fullName, department)
└── .env               # Environment secrets (never commit)

client/src/
├── components/
│   ├── DocumentSignatureApp.jsx  # Main signature orchestration
│   ├── DocumentView.jsx          # Document detail view
│   ├── DocumentList.jsx          # Document listing with filters
│   ├── DocumentCreate.jsx        # Multi-file document creation
│   ├── BatchSignPage.jsx         # Batch signing interface
│   ├── EdsSignature.jsx          # NCALayer EDS integration
│   ├── Login.jsx                 # Authentication
│   ├── MainLayout.jsx            # Layout wrapper
│   └── ProtectedRoute.jsx        # Auth guard
├── api/               # Axios API client functions (auth, documents, documentTypes, departments)
├── App.jsx            # Routing
└── main.jsx           # Entry point
```

## Data Model

- **documents**: title, status (pending/in_progress/completed/cancelled), signatureType (eds/simple), signatureSequential, creator, assigned_users, originalFile, currentFile, signers (JSON), signatureHistory (JSON), documentType
- **document_types**: name (unique)
- **departments**: name (unique), users
- **users** (extended): username, email, password, fullName, department, role

## Key Patterns

- Strapi factory pattern: `factories.createCoreController()` / `factories.createCoreRouter()`
- Frontend API layer in `client/src/api/` wraps Axios calls
- Toast notifications via React Context (`useToast()`)
- Protected routes via `ProtectedRoute` component
- CORS enabled for all origins in `server/config/middlewares.ts`

## Environment Variables

Backend (`server/.env`): HOST, PORT, APP_KEYS, API_TOKEN_SALT, ADMIN_JWT_SECRET, JWT_SECRET, ENCRYPTION_KEY, TRANSFER_TOKEN_SALT

Frontend: `VITE_API_BASE` (dev: `http://localhost:1337`, prod: `http://192.168.101.25:1345`)

## Conventions

- Backend code in TypeScript, frontend in JSX
- Russian language in UI strings and some code comments
- Component files are large (500-1000+ lines) — single-file component pattern
- File uploads stored in `server/public/uploads/`
- Signed PDF workflow: original file -> add QR/stamp per signer -> update currentFile
