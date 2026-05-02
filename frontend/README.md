# Pethijos Frontend

Modern React application for the administrative management of Kinderdog and Pethijos.

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- `npm` or `yarn`

### Setup
1. Copy `.env.example` to `.env`.
2. Update `.env` with your backend URL and storage credentials.

### Scripts
- `npm run dev`: Start Vite development server.
- `npm run build`: Compile for production.
- `npm run preview`: Preview production build locally.

## 📦 Core Modules

- **Operations Dashboard**: Unified center for check-in/out and reservation management (Calendar & List views).
- **Client & Pet Management**: Detailed records with support for image uploads and medical history.
- **Financial Module**: Transaction recording and financial dashboard.
- **Facility Management**: Room and availability tracking.

## 🎨 UI/UX Features

- **Dual Branding**: Dynamic theme support for Kinderdog (Ambar) and Pethijos (Violeta).
- **Image Handling**: `ImageUpload` component with real-time progress and direct B2 upload via signed URLs.
- **Interactive Dashboards**: Real-time filters and quick actions for operational efficiency.

## 🏗 Architecture

- **Framework**: React 18 + Vite.
- **Styling**: Tailwind CSS for responsive and modern UI.
- **API Client**: Type-safe Axios implementation located in `src/lib/api.ts`.
- **State Management**: React Hooks and Context API for global state (Auth, etc.).

---
**Status**: Production Ready
