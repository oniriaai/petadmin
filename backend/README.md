# Backend Pethijos - API Documentation

Comprehensive admin API for managing Kinderdog (daycare) and Pethijos (pet grooming) business operations.

## 📋 Table of Contents
1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [Core Modules](#core-modules)
4. [API Endpoints](#api-endpoints)
5. [Data Models](#data-models)
6. [Error Handling](#error-handling)
7. [Storage](#storage)

---

## Getting Started

### Environment Setup

> **IMPORTANT**: Never commit `.env` to git. It contains sensitive credentials.

1. Copy the example file:
```bash
cp .env.example .env
```

2. Update `.env` with your local credentials:
   - Database: PostgreSQL connection
   - B2 Storage: API keys, bucket name, endpoint
   - JWT: Secret key for token signing
   - VAT: Default tax percentage for Ecuador

For production, configure environment variables in your deployment platform (GitHub Actions secrets, Docker secrets, Kubernetes env vars, etc.) without committing `.env` to version control.

### Scripts
```bash
npm run dev      # Start dev server with hot reload
npm run build    # Build TypeScript
npm run start    # Start production server
```

### Health Check
```
GET /api/v1/health
Response: { ok: true, service: "pethijos-backend", ts: "2026-05-01T..." }
```

---

## Authentication

All endpoints (except `/auth/login` and `/health`) require JWT authentication.

### Login
```
POST /api/v1/auth/login
Body: { "username": "kinderdog_admin", "password": "kinderdog123" }
Response: { "token": "eyJhbGciOiJIUzI1NiIs..." }
```

### Token Usage
Include in all requests:
```
Authorization: Bearer <token>
```

**Token Claims:**
- `userId`: User ID
- `username`: Username
- `businessUnit`: KINDERDOG or PETHIJOS
- `role`: admin, owner, manager, etc.

### Authorization
- Users can only access their businessUnit's data
- Admin role can access all businessUnits
- Soft delete enforced via `isActive` flag

---

## Core Modules

### 1. Client Management
CRUD operations for client information with documents and contracts.

**Models:**
- `firstName`, `lastName`: Required
- `idNumber`, `phone`, `whatsapp`, `email`: Optional
- `address`, `city`, `province`: Address info
- `birthdate`, `notes`: Additional data
- `isActive`: Soft delete flag

### 2. Pet Management
Track pets with medical and identification info.

**Models:**
- `name`, `species`, `breed`, `color`: Pet info
- `sex`, `birthdate`, `weight`, `height`: Physical traits
- `microchip`, `isNeutered`: ID & medical
- `allergies`, `notes`: Medical notes
- `photoUrl`: Pet photo from B2 storage

### 3. Room Management
Daycare facility rooms with capacity tracking.

**Models:**
- `name`, `capacity`: Required
- `businessUnit`: KINDERDOG or PETHIJOS
- `type`: Room category
- `isActive`: Status

**Features:**
- Real-time occupancy calculation
- Capacity validation on reservations

### 4. Recurring Plans
Subscription plans for regular daycare services.

**Models:**
- `clientId`, `businessUnit`: Owner & business
- `startDate`, `endDate`: Plan duration
- `daysOfWeek`: "1,3,5" (Sunday=0, Saturday=6)
- `petIds`: Comma-separated pet IDs
- `service`: GUARDERIA, etc.
- `roomId` (optional): Assigned room

### 5. Reservations
Individual booking records with validation.

**Models:**
- `clientId`, `service`: Required
- `roomId` (optional): Room assignment
- `status`: PENDIENTE, ACTIVA, COMPLETADA, CANCELADA
- `checkIn`, `checkOut`: Timestamps
- `needsTransport`: Boolean flag
- `basePrice`, `vatPercent`, `totalAmount`, `pendingAmount`: Pricing

**Validations:**
- Pet ownership (all petIds belong to clientId)
- Room capacity (checks ACTIVA reservations)
- Conflict detection (overlapping bookings)

### 6. Financial Management
Income, expense, and purchase tracking (KINDERDOG & PETHIJOS separate).

**Income:**
- Track revenue by businessUnit
- Link to reservations (optional)
- VAT calculation & invoice status
- Payment method tracking

**Expense:**
- Categories: SUMINISTROS, SERVICIOS, PERSONAL, UTILIDADES, MANTENIMIENTO
- Provider tracking
- Business unit separation

**Purchase:**
- Quantity × unit price tracking
- Auto-calculated totals
- Provider reference

---

## API Endpoints

### Health & Auth
```
GET  /api/v1/health                    # System health check
POST /api/v1/auth/login                # Authenticate user
```

### Clients
```
GET  /api/v1/clients                   # List clients
GET  /api/v1/clients/:id               # Get single client
POST /api/v1/clients                   # Create client
PUT  /api/v1/clients/:id               # Update client
DEL  /api/v1/clients/:id               # Soft delete client
```

### Pets
```
GET  /api/v1/pets                      # List pets
GET  /api/v1/pets/:id                  # Get single pet
POST /api/v1/pets                      # Create pet
PUT  /api/v1/pets/:id                  # Update pet
DEL  /api/v1/pets/:id                  # Soft delete pet

GET  /api/v1/pets/:id/vaccinations     # Get pet vaccinations
POST /api/v1/pets/:id/vaccinations     # Add vaccination
DEL  /api/v1/pets/:id/vaccinations/:id # Remove vaccination
```

### Rooms
```
GET  /api/v1/rooms                     # List rooms with occupancy
GET  /api/v1/rooms/:id                 # Get single room
POST /api/v1/rooms                     # Create room
PUT  /api/v1/rooms/:id                 # Update room
DEL  /api/v1/rooms/:id                 # Soft delete room
```

### Recurring Plans
```
GET  /api/v1/recurring-plans           # List plans
GET  /api/v1/recurring-plans/:id       # Get single plan
POST /api/v1/recurring-plans           # Create plan
PUT  /api/v1/recurring-plans/:id       # Update plan
DEL  /api/v1/recurring-plans/:id       # Soft delete plan
```

### Reservations
```
GET  /api/v1/reservations              # List reservations
GET  /api/v1/reservations/:id          # Get single reservation
POST /api/v1/reservations              # Create reservation
PUT  /api/v1/reservations/:id          # Update reservation
DEL  /api/v1/reservations/:id          # Cancel reservation

POST /api/v1/reservations/:id/checkin  # Check-in pet
POST /api/v1/reservations/:id/checkout # Check-out pet (create income)
```

### Financial - Income
```
GET  /api/v1/financial/incomes         # List incomes (filters: businessUnit, date, type)
GET  /api/v1/financial/incomes/:id     # Get single income
POST /api/v1/financial/incomes         # Create income
PUT  /api/v1/financial/incomes/:id     # Update income
DEL  /api/v1/financial/incomes/:id     # Soft delete income
```

### Financial - Expenses
```
GET  /api/v1/financial/expenses        # List expenses (filters: businessUnit, date, category)
GET  /api/v1/financial/expenses/:id    # Get single expense
POST /api/v1/financial/expenses        # Create expense
PUT  /api/v1/financial/expenses/:id    # Update expense
DEL  /api/v1/financial/expenses/:id    # Soft delete expense
```

### Financial - Purchases
```
GET  /api/v1/financial/purchases       # List purchases (filters: businessUnit, date)
GET  /api/v1/financial/purchases/:id   # Get single purchase
POST /api/v1/financial/purchases       # Create purchase
PUT  /api/v1/financial/purchases/:id   # Update purchase
DEL  /api/v1/financial/purchases/:id   # Soft delete purchase
```

### Storage
```
POST /api/v1/storage/upload-url        # Get presigned URL for B2 upload
GET  /api/v1/storage/file/:id          # Get file metadata
```

### Dashboard & Reports
```
GET  /api/v1/dashboard/summary         # Dashboard data summary
GET  /api/v1/reports/...               # Various reports
```

---

## Data Models

### Common Fields
All models include:
- `id`: Unique identifier (CUID)
- `isActive`: Soft delete flag (default: true)
- `createdAt`: Creation timestamp

### Timestamps
- `updatedAt`: Last update timestamp (included where applicable)

### Soft Delete Pattern
Records are never deleted; instead, `isActive` is set to false:
```
DELETE /api/v1/clients/:id
→ UPDATE clients SET is_active = false WHERE id = :id
```

---

## Example Requests

### Create Income Record
```bash
curl -X POST http://localhost:3001/api/v1/financial/incomes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "businessUnit": "KINDERDOG",
    "concept": "Guardería - María (1 semana)",
    "amount": 150000,
    "vatPercent": 19,
    "vatAmount": 28500,
    "total": 178500,
    "paymentMethod": "EFECTIVO",
    "date": "2026-05-01",
    "notes": "Pago completo"
  }'
```

### Create Reservation
```bash
curl -X POST http://localhost:3001/api/v1/reservations \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "businessUnit": "KINDERDOG",
    "clientId": "cli_xxx",
    "petIds": "pet_yyy,pet_zzz",
    "roomId": "room_aaa",
    "service": "GUARDERIA",
    "status": "PENDIENTE",
    "basePrice": 150000,
    "vatPercent": 0,
    "totalAmount": 150000,
    "needsTransport": false
  }'
```

### Check-in Pet
```bash
curl -X POST http://localhost:3001/api/v1/reservations/res_xxx/checkin \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"time": "09:00"}'
```

### Filter Expenses by Date
```bash
curl "http://localhost:3001/api/v1/financial/expenses?businessUnit=KINDERDOG&startDate=2026-04-01&endDate=2026-04-30" \
  -H "Authorization: Bearer <token>"
```

---

## Error Handling

### Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad request (validation error)
- `401`: Unauthorized (missing token)
- `403`: Forbidden (unauthorized businessUnit)
- `404`: Not found
- `500`: Server error

### Error Response Format
```json
{
  "error": "Description of what went wrong"
}
```

### Validation Errors
```json
{
  "error": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "path": ["concept"],
      "message": "String must contain at least 1 character(s)"
    }
  ]
}
```

---

## Storage

### Backblaze B2 Integration
The backend uses AWS SDK (compatible with S3) for B2 storage:
- No local file storage
- Direct upload from client via presigned URLs
- Secure, scalable solution

### Upload Flow
1. Client requests presigned URL: `POST /api/v1/storage/upload-url`
2. Backend returns signed URL valid for 15 minutes
3. Client uploads directly to B2
4. Store file URL in database (pet.photoUrl, etc.)

---

## Database

### PostgreSQL Setup
```bash
# Connection via Docker
DATABASE_URL=postgresql://pethijos:pethijos123@localhost:5433/pethijos

# Create/migrate database
npx prisma migrate dev
```

### Key Tables
- `users`: Authentication & authorization
- `clients`: Customer information
- `pets`: Pet records with medical info
- `rooms`: Facility rooms
- `recurring_plans`: Subscription plans
- `reservations`: Individual bookings
- `incomes`: Revenue tracking
- `expenses`: Expense tracking
- `purchases`: Purchase tracking

---

## Deployment

### Docker
Backend runs in container on port 3001:
```bash
docker run -p 3001:3001 pethijos-backend
```

### Environment Variables
See `.env` template in project root.

### Database Connection
Connects to PostgreSQL on localhost:5433 (mapped from internal 5432).

---

## Development

### TypeScript
- Strict mode enabled
- All files in `src/` compiled to `dist/`
- Type checking with `tsc -b`

### Authentication Middleware
All routes automatically validate JWT tokens and extract user info:
```typescript
// req.user is available in all routes
const businessUnit = req.user!.businessUnit;
const userId = req.user!.userId;
const role = req.user!.role;
```

### Adding New Routes
1. Create route file in `src/routes/`
2. Import and register in `main.ts`
3. Use `requireAuth` middleware for protected routes
4. Define Zod schemas for validation
5. Handle errors with proper status codes

---

## Support & Documentation

### Related Documentation
- Frontend: `/frontend/README.md`
- Database: `/backend/prisma/schema.prisma`
- Main project: `/README.md`

### API Testing
Use provided test scripts or Postman for endpoint testing.

---

**Last Updated**: 2026-05-01  
**Status**: Production Ready  
**Version**: 1.0
