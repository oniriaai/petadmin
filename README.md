# Pethijos - Sistema Administrativo

Administrative system for managing **Kinderdog** (dog daycare) and **Pethijos** (pet grooming) operations.

## 🌟 Overview

This project provides a unified platform for pet business management, handling everything from client/pet records and facility availability to complex financial tracking and operational check-ins.

### Tech Stack
- **Backend**: Node.js, TypeScript, Express, Prisma ORM, PostgreSQL.
- **Frontend**: React, Vite, TypeScript, Tailwind CSS.
- **Infrastructure**: Docker, Docker Compose.
- **Storage**: Backblaze B2 (S3-compatible).

## 🚀 Quick Start

### 1. Environment Setup
Copy the example environment file and update it with your local credentials:
```bash
cp .env.example .env
```

### 2. Run with Docker
Start the entire stack (PostgreSQL, Backend, Frontend):
```bash
docker compose up --build
```

### 3. Access the Application
- **Frontend**: [http://localhost:5174](http://localhost:5174)
- **Backend Health**: [http://localhost:3001/api/v1/health](http://localhost:3001/api/v1/health)

## 📖 Detailed Documentation

The project is divided into two main modules, each with its own detailed documentation:

- [**Backend Documentation**](backend/README.md): API reference, architecture details, and data models.
- [**Frontend Documentation**](frontend/README.md): UI components, state management, and implementation details.
- [**Functional Design**](docs/functional-design.md): Detailed functional requirements and implementation logic.

## 🛠 Features

- **Dual Identity Support**: Independent branding and operations for Kinderdog and Pethijos.
- **Unified Operations**: Integrated calendar and list views for check-ins and reservations.
- **Financial Management**: Automated income generation from check-outs and detailed expense tracking.
- **Resource Management**: Room capacity tracking and pet medical records.

---
**Status**: MVP Phase 1 Complete
