# Frontend Pethijos

Aplicación React moderna para la gestión administrativa.

## Scripts

- `npm run dev`: Inicia el servidor de desarrollo (Vite).
- `npm run build`: Compila para producción.
- `npm run preview`: Previsualiza la compilación de producción.

## Características de UI/UX

- **Gestión de Imágenes**: Incluye un componente `ImageUpload` con:
  - Previsualización instantánea.
  - Barra de progreso real (vía Axios).
  - Subida directa a Backblaze B2 mediante URLs firmadas.
- **Identidad Visual Dual**: Soporte para Kinderdog (Ambar) y Pethijos (Violeta).
- **Dashboard Interactivo**: Con pestañas integradas para todos los módulos operativos.

## Tecnologías Principales

- React 18
- TypeScript
- Tailwind CSS
- Lucide React (Iconos)
- Axios (Cliente HTTP con soporte para progreso)
