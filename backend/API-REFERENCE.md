# Pethijos API Reference

Complete API reference for all Pethijos backend endpoints with examples.

## Table of Contents
- [Authentication](#authentication)
- [Clients API](#clients-api)
- [Pets API](#pets-api)
- [Rooms API](#rooms-api)
- [Recurring Plans API](#recurring-plans-api)
- [Reservations API](#reservations-api)
- [Financial API](#financial-api)
- [Storage API](#storage-api)

---

## Authentication

All endpoints require a JWT token except `/health` and `/auth/login`.

### Login
**Request:**
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "kinderdog_admin",
  "password": "kinderdog123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "username": "kinderdog_admin",
    "businessUnit": "KINDERDOG",
    "role": "owner"
  }
}
```

### Token Usage
Include in all subsequent requests:
```http
Authorization: Bearer <token>
```

---

## Clients API

### List Clients
**Request:**
```http
GET /api/v1/clients?search=María&status=active
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "cli_abc123",
    "firstName": "María",
    "lastName": "González",
    "idNumber": "123456789",
    "phone": "555-1234",
    "email": "maria@example.com",
    "address": "Calle 1, Apt 10",
    "city": "Bogotá",
    "province": "Cundinamarca",
    "birthdate": "1990-05-15T00:00:00Z",
    "isActive": true,
    "createdAt": "2026-04-01T10:00:00Z"
  }
]
```

### Get Client
**Request:**
```http
GET /api/v1/clients/cli_abc123
Authorization: Bearer <token>
```

### Create Client
**Request:**
```http
POST /api/v1/clients
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Juan",
  "lastName": "Pérez",
  "idNumber": "987654321",
  "phone": "555-5678",
  "email": "juan@example.com",
  "address": "Carrera 2, House 20",
  "city": "Bogotá"
}
```

**Response:** (201 Created)
```json
{
  "id": "cli_xyz789",
  "firstName": "Juan",
  "lastName": "Pérez",
  "idNumber": "987654321",
  "phone": "555-5678",
  "email": "juan@example.com",
  "isActive": true,
  "createdAt": "2026-05-01T15:00:00Z"
}
```

### Update Client
**Request:**
```http
PUT /api/v1/clients/cli_abc123
Authorization: Bearer <token>
Content-Type: application/json

{
  "phone": "555-9999",
  "email": "maria.new@example.com"
}
```

### Delete Client
**Request:**
```http
DELETE /api/v1/clients/cli_abc123
Authorization: Bearer <token>
```

**Response:** (Soft delete - sets isActive to false)
```json
{
  "id": "cli_abc123",
  "isActive": false
}
```

---

## Pets API

### List Pets
**Request:**
```http
GET /api/v1/pets?clientId=cli_abc123&species=dog
Authorization: Bearer <token>
```

### Get Pet
**Request:**
```http
GET /api/v1/pets/pet_abc123
Authorization: Bearer <token>
```

### Create Pet
**Request:**
```http
POST /api/v1/pets
Authorization: Bearer <token>
Content-Type: application/json

{
  "clientId": "cli_abc123",
  "name": "Max",
  "species": "dog",
  "breed": "Golden Retriever",
  "color": "Golden",
  "sex": "M",
  "birthdate": "2020-03-15T00:00:00Z",
  "weight": 32.5,
  "microchip": "CHIP123456",
  "isNeutered": true,
  "allergies": "None",
  "notes": "Very friendly"
}
```

### Update Pet
**Request:**
```http
PUT /api/v1/pets/pet_abc123
Authorization: Bearer <token>
Content-Type: application/json

{
  "weight": 33.0,
  "notes": "Updated weight"
}
```

### Get Vaccinations
**Request:**
```http
GET /api/v1/pets/pet_abc123/vaccinations
Authorization: Bearer <token>
```

### Add Vaccination
**Request:**
```http
POST /api/v1/pets/pet_abc123/vaccinations
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Rabia",
  "date": "2026-05-01T00:00:00Z",
  "nextDue": "2027-05-01T00:00:00Z"
}
```

---

## Rooms API

### List Rooms
**Request:**
```http
GET /api/v1/rooms?businessUnit=KINDERDOG
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "room_abc",
    "name": "Sala A",
    "businessUnit": "KINDERDOG",
    "capacity": 8,
    "type": "daycare",
    "occupancy": 5,
    "isActive": true
  }
]
```

### Get Room
**Request:**
```http
GET /api/v1/rooms/room_abc
Authorization: Bearer <token>
```

### Create Room
**Request:**
```http
POST /api/v1/rooms
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Sala B",
  "businessUnit": "KINDERDOG",
  "capacity": 10,
  "type": "daycare"
}
```

### Update Room
**Request:**
```http
PUT /api/v1/rooms/room_abc
Authorization: Bearer <token>
Content-Type: application/json

{
  "capacity": 12
}
```

### Delete Room
**Request:**
```http
DELETE /api/v1/rooms/room_abc
Authorization: Bearer <token>
```

---

## Recurring Plans API

### List Plans
**Request:**
```http
GET /api/v1/recurring-plans?businessUnit=KINDERDOG&status=active
Authorization: Bearer <token>
```

### Get Plan
**Request:**
```http
GET /api/v1/recurring-plans/plan_abc
Authorization: Bearer <token>
```

### Create Plan
**Request:**
```http
POST /api/v1/recurring-plans
Authorization: Bearer <token>
Content-Type: application/json

{
  "businessUnit": "KINDERDOG",
  "clientId": "cli_abc123",
  "startDate": "2026-05-01T00:00:00Z",
  "endDate": "2026-08-01T00:00:00Z",
  "daysOfWeek": "1,3,5",
  "petIds": "pet_abc123,pet_xyz789",
  "service": "GUARDERIA",
  "roomId": "room_abc",
  "notes": "3 days per week plan"
}
```

### Update Plan
**Request:**
```http
PUT /api/v1/recurring-plans/plan_abc
Authorization: Bearer <token>
Content-Type: application/json

{
  "endDate": "2026-09-01T00:00:00Z"
}
```

---

## Reservations API

### List Reservations
**Request:**
```http
GET /api/v1/reservations?businessUnit=KINDERDOG&status=ACTIVA&search=María
Authorization: Bearer <token>
```

### Get Reservation
**Request:**
```http
GET /api/v1/reservations/res_abc123
Authorization: Bearer <token>
```

### Create Reservation
**Request:**
```http
POST /api/v1/reservations
Authorization: Bearer <token>
Content-Type: application/json

{
  "businessUnit": "KINDERDOG",
  "clientId": "cli_abc123",
  "petIds": "pet_abc123,pet_xyz789",
  "roomId": "room_abc",
  "service": "GUARDERIA",
  "basePrice": 150000,
  "vatPercent": 0,
  "totalAmount": 150000,
  "needsTransport": false,
  "notes": "Bring food"
}
```

### Check-in
**Request:**
```http
POST /api/v1/reservations/res_abc123/checkin
Authorization: Bearer <token>
Content-Type: application/json

{
  "time": "09:00"
}
```

**Response:**
```json
{
  "id": "res_abc123",
  "status": "ACTIVA",
  "checkIn": "2026-05-01T09:00:00Z"
}
```

### Check-out
**Request:**
```http
POST /api/v1/reservations/res_abc123/checkout
Authorization: Bearer <token>
Content-Type: application/json

{
  "createIncome": true,
  "paymentMethod": "EFECTIVO"
}
```

**Response:**
```json
{
  "id": "res_abc123",
  "status": "COMPLETADA",
  "checkOut": "2026-05-01T17:00:00Z",
  "incomeCreated": {
    "id": "inc_xyz",
    "amount": 150000
  }
}
```

---

## Financial API

### Income Endpoints

#### List Incomes
**Request:**
```http
GET /api/v1/financial/incomes?businessUnit=KINDERDOG&startDate=2026-04-01&endDate=2026-04-30
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "inc_abc123",
    "businessUnit": "KINDERDOG",
    "concept": "Guardería - María (Semana 1)",
    "amount": 150000,
    "vatPercent": 19,
    "vatAmount": 28500,
    "total": 178500,
    "paymentMethod": "EFECTIVO",
    "invoiceStatus": "PAGADO",
    "date": "2026-05-01T00:00:00Z",
    "notes": "Pago completo",
    "isActive": true,
    "createdAt": "2026-05-01T10:00:00Z"
  }
]
```

#### Create Income
**Request:**
```http
POST /api/v1/financial/incomes
Authorization: Bearer <token>
Content-Type: application/json

{
  "businessUnit": "KINDERDOG",
  "concept": "Guardería - Juan (Semana 1)",
  "amount": 180000,
  "vatPercent": 19,
  "paymentMethod": "TARJETA",
  "date": "2026-05-01T00:00:00Z",
  "notes": "Visa payment"
}
```

**Response:** (201 Created)
```json
{
  "id": "inc_xyz789",
  "businessUnit": "KINDERDOG",
  "concept": "Guardería - Juan (Semana 1)",
  "amount": 180000,
  "vatPercent": 19,
  "vatAmount": 34200,
  "total": 214200,
  "paymentMethod": "TARJETA",
  "invoiceStatus": "PENDIENTE",
  "date": "2026-05-01T00:00:00Z",
  "isActive": true,
  "createdAt": "2026-05-01T15:30:00Z"
}
```

#### Update Income
**Request:**
```http
PUT /api/v1/financial/incomes/inc_abc123
Authorization: Bearer <token>
Content-Type: application/json

{
  "invoiceStatus": "PAGADO"
}
```

#### Delete Income
**Request:**
```http
DELETE /api/v1/financial/incomes/inc_abc123
Authorization: Bearer <token>
```

### Expense Endpoints

#### List Expenses
**Request:**
```http
GET /api/v1/financial/expenses?businessUnit=KINDERDOG&category=SUMINISTROS
Authorization: Bearer <token>
```

#### Create Expense
**Request:**
```http
POST /api/v1/financial/expenses
Authorization: Bearer <token>
Content-Type: application/json

{
  "businessUnit": "KINDERDOG",
  "category": "SUMINISTROS",
  "description": "Comida para perros (50kg)",
  "amount": 250000,
  "provider": "PetFoods Inc",
  "date": "2026-05-01T00:00:00Z",
  "notes": "Entrega incluida"
}
```

### Purchase Endpoints

#### List Purchases
**Request:**
```http
GET /api/v1/financial/purchases?businessUnit=KINDERDOG
Authorization: Bearer <token>
```

#### Create Purchase
**Request:**
```http
POST /api/v1/financial/purchases
Authorization: Bearer <token>
Content-Type: application/json

{
  "businessUnit": "KINDERDOG",
  "description": "Medicinas veterinarias",
  "quantity": 5,
  "unitPrice": 50000,
  "provider": "VetSupply Co",
  "date": "2026-05-01T00:00:00Z"
}
```

**Response:**
```json
{
  "id": "pur_abc123",
  "businessUnit": "KINDERDOG",
  "description": "Medicinas veterinarias",
  "quantity": 5,
  "unitPrice": 50000,
  "totalPrice": 250000,
  "provider": "VetSupply Co",
  "date": "2026-05-01T00:00:00Z",
  "isActive": true,
  "createdAt": "2026-05-01T11:00:00Z"
}
```

---

## Storage API

### Get Upload URL
**Request:**
```http
POST /api/v1/storage/upload-url
Authorization: Bearer <token>
Content-Type: application/json

{
  "fileName": "max_photo.jpg",
  "fileType": "image/jpeg"
}
```

**Response:**
```json
{
  "uploadUrl": "https://b2.example.com/signed/...",
  "fileId": "file_abc123",
  "expiresIn": 900
}
```

---

## Error Responses

### Validation Error (400)
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

### Unauthorized (401)
```json
{
  "error": "No autorizado"
}
```

### Forbidden (403)
```json
{
  "error": "Unauthorized"
}
```

### Not Found (404)
```json
{
  "error": "Resource not found"
}
```

### Server Error (500)
```json
{
  "error": "Failed to fetch resource"
}
```

---

**Last Updated**: 2026-05-01  
**Version**: 1.0  
**Status**: Production Ready
