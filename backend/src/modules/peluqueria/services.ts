export interface GroomingServiceItem {
  id: string;
  name: string;
  category: "BANO" | "CORTE" | "COMPLETO" | "TRATAMIENTO" | "ADICIONAL";
  durationMinutes: number;
  basePrice: number;
  description: string;
}

export const DEFAULT_GROOMING_SERVICES: GroomingServiceItem[] = [
  {
    id: "bano_basico",
    name: "Baño Básico & Secado",
    category: "BANO",
    durationMinutes: 45,
    basePrice: 15,
    description: "Baño relajante con champú hipoalergénico, secado y limpieza básica de orejas.",
  },
  {
    id: "bano_corte_higienico",
    name: "Baño + Corte Higiénico",
    category: "BANO",
    durationMinutes: 60,
    basePrice: 20,
    description:
      "Baño completo más despeje de almohadillas, zona genital, lagrimales y corte de uñas.",
  },
  {
    id: "peluqueria_completa",
    name: "Peluquería Integral (Baño + Corte de Raza)",
    category: "COMPLETO",
    durationMinutes: 90,
    basePrice: 30,
    description:
      "Servicio completo: corte de raza o personalizado a máquina/tijera, baño nutritivo y perfume.",
  },
  {
    id: "deslanado_profundo",
    name: "Deslanado Profundo",
    category: "TRATAMIENTO",
    durationMinutes: 75,
    basePrice: 25,
    description:
      "Tratamiento intensivo para mantos con doble capa para retirar subpelo muerto y evitar nudos.",
  },
  {
    id: "corte_unas_spa",
    name: "Corte de Uñas & Limado Spa",
    category: "ADICIONAL",
    durationMinutes: 20,
    basePrice: 8,
    description: "Corte seguro de uñas con limado suave y bálsamo hidratante para almohadillas.",
  },
  {
    id: "bano_medicado",
    name: "Baño Medicado / Dermatológico",
    category: "TRATAMIENTO",
    durationMinutes: 50,
    basePrice: 22,
    description:
      "Aplicación de champú medicado con tiempo de reposo para tratamiento dérmico específico.",
  },
];
