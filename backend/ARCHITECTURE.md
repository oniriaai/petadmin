# Pethijos Backend - Architecture & Implementation Guide

## System Architecture

### Overview
Modular backend API serving two independent business units (KINDERDOG daycare and PETHIJOS grooming) with shared client/pet database and separate financial tracking.

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (React)                        │
│           (Port 5174/5175 - Vite Dev Server)             │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ HTTPS
                        │
┌───────────────────────▼─────────────────────────────────┐
│              Backend API (Express.js)                    │
│              (Port 3001 - Node.js)                       │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Authentication Layer                  │   │
│  │  • JWT Token Validation                         │   │
│  │  • Business Unit Authorization                  │   │
│  │  • Role-Based Access Control                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Core Modules                             │   │
│  │  • Clients & Pets (Shared)                      │   │
│  │  • Rooms (KINDERDOG only)                       │   │
│  │  • Recurring Plans (KINDERDOG only)             │   │
│  │  • Reservations (KINDERDOG & PETHIJOS)          │   │
│  │  • Financial (Income, Expense, Purchase)        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │      Data Validation & Business Logic            │   │
│  │  • Zod Schema Validation                        │   │
│  │  • Pet Ownership Validation                     │   │
│  │  • Room Capacity Checks                         │   │
│  │  • Conflict Detection                           │   │
│  │  • Financial Calculations                       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │        Data Persistence Layer                    │   │
│  │  • Prisma ORM                                   │   │
│  │  • Parameterized Queries (SQL Injection Safe)  │   │
│  │  • Soft Delete Pattern (isActive flag)          │   │
│  └─────────────────────────────────────────────────┘   │
└────────────────────┬──────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
   ┌────────┐   ┌──────────┐   ┌────────┐
   │PostgreSQL│  │ Backblaze │  │ File   │
   │Database  │  │    B2     │  │System  │
   │(5433)    │  │ Storage   │  │        │
   └────────┘   └──────────┘   └────────┘
```

### Technology Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Validation**: Zod
- **Authentication**: JWT
- **Storage**: Backblaze B2 (S3-compatible)

---

## Module Structure

### 1. Authentication Module (`src/routes/auth.ts`)
**Responsibility**: User authentication and token generation

**Endpoints**:
- `POST /auth/login` - Generate JWT token

**Key Concepts**:
- JWT tokens with 12-hour expiry
- Token claims: userId, username, businessUnit, role
- All protected endpoints require valid token

**Middleware**: `requireAuth` extracts token and populates `req.user`

### 2. Client Module (`src/routes/clients.ts`)
**Responsibility**: Client CRUD operations

**Features**:
- Full contact information management
- Multi-address support
- Document storage
- Client history and notes
- Soft delete with audit trail

**Validations**:
- Required fields: firstName, lastName
- Email format validation
- Phone number format validation

### 3. Pet Module (`src/routes/pets.ts`)
**Responsibility**: Pet records and medical history

**Features**:
- Link pets to clients
- Medical information (vaccinations, allergies)
- Physical measurements
- Microchip tracking
- Photo storage (B2)
- Vaccination history

**Validations**:
- Required fields: name, species, sex, clientId
- Species enum: dog, cat, bird, etc.
- Weight/height reasonable ranges

### 4. Room Module (`src/routes/rooms.ts`)
**Responsibility**: Daycare facility room management

**Features**:
- Room capacity tracking
- Real-time occupancy calculation
- Business unit separation
- Room types (daycare, etc.)

**Real-Time Occupancy Logic**:
```typescript
// Calculate current occupancy
const occupancy = await prisma.reservation.count({
  where: {
    roomId: id,
    status: "ACTIVA",
    checkIn: { lte: new Date() },
    checkOut: { gte: new Date() }
  }
});
```

### 5. Recurring Plans Module (`src/routes/recurring-plans.ts`)
**Responsibility**: Subscription plan management for regular clients

**Features**:
- Multi-week frequency support (daysOfWeek: "1,3,5")
- Date range planning
- Pet list management (comma-separated IDs)
- Room assignment
- Status tracking

**Data Format**:
- `daysOfWeek`: "1,3,5" (Monday, Wednesday, Friday)
- `petIds`: "pet_1,pet_2,pet_3"

### 6. Reservations Module (`src/routes/reservations.ts`)
**Responsibility**: Individual booking management with validation

**Key Validations**:

**a) Pet Ownership Validation**
```typescript
const pets = await prisma.pet.findMany({
  where: { id: { in: petIds } }
});
if (pets.some(p => p.clientId !== clientId)) {
  throw new Error("Pet does not belong to client");
}
```

**b) Room Capacity Validation**
```typescript
const occupancy = await prisma.reservation.count({
  where: {
    roomId: id,
    status: "ACTIVA",
    checkIn: { lte: checkInDate }
  }
});
if (occupancy >= room.capacity) {
  throw new Error("Room at capacity");
}
```

**c) Conflict Detection**
```typescript
const conflicts = await prisma.reservation.findMany({
  where: {
    roomId: id,
    checkIn: { lt: checkOut },
    checkOut: { gt: checkIn },
    status: "ACTIVA"
  }
});
```

**Status Flow**:
- `PENDIENTE` → (check-in) → `ACTIVA` → (check-out) → `COMPLETADA`
- Any status → `CANCELADA` (manual cancel)

### 7. Financial Module (`src/routes/financial.ts`)
**Responsibility**: Income, expense, and purchase tracking

**Three Sub-modules**:

**Income**:
- Link to reservations (optional)
- VAT calculation
- Payment method tracking
- Invoice status management

**Expense**:
- Category-based (SUMINISTROS, SERVICIOS, PERSONAL, etc.)
- Provider tracking
- Date-based filtering

**Purchase**:
- Quantity × unit price tracking
- Auto-calculated totals
- Provider reference

**Filtering Examples**:
```
GET /financial/incomes?businessUnit=KINDERDOG&startDate=2026-04-01&endDate=2026-04-30
GET /financial/expenses?category=SUMINISTROS
GET /financial/purchases?businessUnit=KINDERDOG
```

### 8. Storage Module (`src/routes/storage.ts`)
**Responsibility**: File upload management via Backblaze B2

**Features**:
- Presigned URL generation
- Direct client upload (no server storage)
- S3-compatible SDK
- Security: signed URLs expire in 15 minutes

---

## Data Validation Strategy

### Zod Schemas
All input data validated with Zod before database operations:

```typescript
const ClientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});
```

### Validation Errors
Return 400 with detailed error information:
```json
{
  "error": [
    {
      "code": "too_small",
      "path": ["firstName"],
      "message": "String must contain at least 1 character(s)"
    }
  ]
}
```

### Business Logic Validation
Additional validation beyond schema:
- Pet ownership (must belong to client)
- Room capacity (cannot exceed limit)
- Reservation conflicts (overlapping bookings)
- Authorization (user's businessUnit matches data)

---

## Security Measures

### Authentication
- JWT token-based authentication
- Tokens contain: userId, username, businessUnit, role
- All protected routes require valid token

### Authorization
- Business unit separation enforced
- Users can only access their businessUnit's data
- Admin role can access all businessUnits
- Role-based access control (admin, owner, manager, etc.)

### Data Protection
- Soft delete pattern (isActive flag)
- SQL injection prevention (Prisma parameterized queries)
- Input validation with Zod
- Type-safe database operations

### API Security
- CORS enabled
- JSON payload size limited to 10MB
- Error messages don't expose sensitive data
- Proper HTTP status codes

---

## Database Design

### Soft Delete Pattern
All records include `isActive` boolean (default: true):
```typescript
// Delete
UPDATE clients SET is_active = false WHERE id = :id;

// Query (default filters active only)
SELECT * FROM clients WHERE is_active = true;
```

### Indexes
Strategic indexes for common queries:
```
• clients(businessUnit, isActive)
• reservations(clientId, status, date)
• financial.incomes(businessUnit, date)
• rooms(businessUnit, isActive)
```

### Relations
- Client → Pets (1:N)
- Client → Reservations (1:N)
- Reservation → Pets (M:N through ReservationPet)
- Room → Reservations (1:N)
- RecurringPlan → Reservations (1:N)

---

## Error Handling

### HTTP Status Codes
- `200`: Success (GET, PUT)
- `201`: Created (POST)
- `400`: Validation error
- `401`: Unauthorized (invalid/missing token)
- `403`: Forbidden (unauthorized businessUnit)
- `404`: Not found
- `500`: Server error

### Error Response Format
```json
{
  "error": "Human-readable error message or array of validation errors"
}
```

### Try-Catch Pattern
```typescript
try {
  // operation
} catch (error) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors });
  }
  console.error("Error:", error);
  res.status(500).json({ error: "Failed to process request" });
}
```

---

## Performance Optimization

### Database Queries
- Parameterized queries (Prisma)
- Strategic indexes for common filters
- Pagination support (structure in place)
- Relationship eager loading with `include`

### Caching Strategy
- Room occupancy calculated on-demand (fresh data)
- No response caching at API level
- Database connection pooling via Prisma

### Query Optimization Example
```typescript
// Efficient: single query with relations
const reservation = await prisma.reservation.findUnique({
  where: { id },
  include: {
    client: true,
    room: true,
    pets: { include: { pet: true } }
  }
});
```

---

## Testing Strategy

### Manual Testing via CURL
```bash
# Login
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"kinderdog_admin","password":"kinderdog123"}'

# Create income
curl -X POST http://localhost:3001/api/v1/financial/incomes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### Automated Testing
Test scripts available for:
- All CRUD operations
- Validation edge cases
- Authorization checks
- Conflict detection
- Financial calculations

---

## Deployment

### Docker Containerization
```dockerfile
FROM node:18
WORKDIR /app
COPY package.json .
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

### Environment Variables
```env
DATABASE_URL=postgresql://...
BACKEND_PORT=3001
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET_NAME=...
```

### Database Migration
```bash
npx prisma migrate deploy  # Production
npx prisma migrate dev     # Development
```

---

## Development Workflow

### Adding a New Endpoint
1. **Create Schema** (if needed)
   ```typescript
   const NewSchema = z.object({ ... });
   ```

2. **Implement Handler**
   ```typescript
   router.get("/new", requireAuth, async (req, res) => {
     try {
       // handler logic
     } catch (error) {
       // error handling
     }
   });
   ```

3. **Register Route**
   ```typescript
   // In main.ts
   app.use("/api/v1/new", newRouter);
   ```

4. **Test**
   ```bash
   npm run build  # Check TypeScript
   curl http://localhost:3001/api/v1/new
   ```

### Code Style
- TypeScript strict mode
- Consistent error handling
- Zod validation for all inputs
- Authorization checks on sensitive operations
- Descriptive variable names

---

## Known Limitations & Future Work

### Current Limitations
- No pagination (all results returned)
- No caching layer
- No rate limiting
- No audit logging

### Recommended Enhancements
1. Implement pagination for large datasets
2. Add Redis caching for frequent queries
3. Rate limiting per user/API key
4. Audit trail for financial operations
5. Webhook support for integrations
6. Recurring plan auto-generation
7. Email notifications for check-ins

---

**Last Updated**: 2026-05-01  
**Status**: Production Ready  
**Version**: 1.0
