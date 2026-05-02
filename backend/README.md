# Pethijos Backend

Modular API for managing Kinderdog (daycare) and Pethijos (grooming) business operations.

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL

### Environment Setup
1. Copy `.env.example` to `.env`.
2. Configure database, B2 storage, and JWT credentials.
3. **Note**: Never commit `.env` to version control.

### Scripts
- `npm run dev`: Start dev server with hot reload.
- `npm run build`: Build TypeScript.
- `npm run start`: Start production server.

## 🏗 Architecture

The system uses a modular Express.js architecture with Prisma ORM and Zod validation.

- **Authentication**: JWT-based with business unit (KINDERDOG/PETHIJOS) and role-based authorization.
- **Storage**: Backblaze B2 (S3-compatible) via presigned URLs for direct client uploads.
- **Validation**: Strict schema validation using Zod and shared business logic utilities.
- **Data Pattern**: Soft deletes enabled via `isActive` flag on all core models.

## 📦 Core Modules

1. **Clients & Pets**: Shared database for managing customers and their animals.
2. **Rooms**: Facility management with real-time occupancy tracking.
3. **Reservations**: Individual booking management with conflict detection and capacity validation.
4. **Check-In/Out**: Precise timestamp tracking for pet arrivals and departures.
5. **Financial**: Income, expense, and purchase tracking separated by business unit.

## 🔌 API Reference

### Authentication
`POST /api/v1/auth/login` -> Authenticates and returns JWT.

### Key Endpoints
- `GET /api/v1/clients`: List active clients.
- `GET /api/v1/pets`: List pets (filterable by client).
- `GET /api/v1/rooms`: Facility rooms with occupancy.
- `POST /api/v1/reservations`: Create new booking.
- `POST /api/v1/check-in-out`: Standalone or reservation-linked check-ins.
- `GET /api/v1/financial/incomes`: Revenue tracking by business unit.

### Error Handling
- `400`: Validation error (returns Zod error array).
- `401/403`: Unauthorized or Forbidden access.
- `404`: Resource not found.

## 🗄 Database

Uses PostgreSQL with Prisma. Key tables: `users`, `clients`, `pets`, `rooms`, `reservations`, `incomes`, `expenses`, `purchases`.

---
**Version**: 1.2  
**Status**: Production Ready
