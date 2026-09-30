import { useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";

const sections = [
  {
    id: "inicio", title: "🚀 Primeros pasos",
    content: `El sistema Pethijos Admin está dividido en dos unidades de negocio: **Guardería** (estancia diaria) y **Peluquería** (estética y baño). Al iniciar sesión, selecciona tu unidad para acceder al dashboard correspondiente.`
  },
  {
    id: "reservas", title: "Crear una Reserva",
    steps: [
      "Ve a **Control de Reservas** en el menú lateral",
      "Haz clic en **Nueva Reserva** (botón azul, esquina superior derecha)",
      "Selecciona el **cliente** y luego las **mascotas** que asistirán",
      "Elige el **servicio** (Guardería, Peluquería Canina, etc.)",
      "Asigna una **sala** disponible y define las horas de entrada y salida",
      "Ingresa el **precio base**, descuentos y adelantos si aplica",
      "Activa **¿Requiere transporte?** si el cliente necesita recogida o entrega",
      "Haz clic en **Guardar Reserva**"
    ]
  },
  {
    id: "entrada-salida", title: "🚪 Registrar Entrada y Salida",
    steps: [
      "En la lista de reservas, busca la reserva **Confirmada**",
      "Haz clic en el botón verde para **Registrar Entrada** — cambia el estado a Activa",
      "Cuando el cliente retire su mascota, haz clic en el botón amarillo para **Registrar Salida**",
      "Puedes generar automáticamente el ingreso al hacer la salida"
    ]
  },
  {
    id: "clientes", title: "Gestión de Clientes",
    steps: [
      "Ve a **Perfil del Cliente** para ver todos los clientes",
      "Usa el botón **+ Nuevo Cliente** para registrar un dueño",
      "Desde la lista, usa el ícono de mascota para **agregar mascotas** al cliente",
      "Haz clic en el ícono 👁 para ver el perfil completo con historial de reservas"
    ]
  },
  {
    id: "administrativa", title: "Gestión Administrativa",
    steps: [
      "Ve a **Gestión Admin** para manejar gastos y proveedores",
      "En la pestaña **Gastos y Compras**, registra todos los egresos",
      "Para pagar un gasto, haz clic en el botón 💳 de la fila correspondiente",
      "El saldo se actualiza automáticamente con cada pago registrado",
      "En la pestaña **Proveedores** gestiona tu directorio de proveedores"
    ]
  },
  {
    id: "informes", title: "Informes y Exportación",
    steps: [
      "Ve a **Informes y Gráficos** para ver tu análisis financiero",
      "Los KPIs muestran ingresos del mes, utilidad y tendencias",
      "Los gráficos de barras muestran ingresos históricos por mes",
      "El gráfico circular muestra distribución por tipo de servicio",
      "Usa los botones **Excel** para descargar los datos y cargarlos en Power BI"
    ]
  },
  {
    id: "transporte", title: "Transporte",
    content: `La pantalla de **Transporte** muestra las recogidas y entregas del día. Para que una reserva aparezca aquí, debe tener activada la opción **Requiere transporte** al crearla. Las recogidas se muestran en la columna izquierda (clientes que van al establecimiento) y las entregas en la derecha (clientes que regresan a casa).`
  },
  {
    id: "disponibilidad", title: "🏠 Disponibilidad",
    content: `La pantalla de **Disponibilidad** muestra la ocupación de cada sala para el día seleccionado. La barra de color indica el porcentaje de ocupación: verde (< 60%), amarillo (60-90%), rojo (> 90%). Usa las flechas para navegar entre días.`
  },
  {
    id: "alertas", title: "Alertas y Avisos",
    steps: [
      "Ve a **Herramientas** → pestaña Alertas",
      "Crea alertas de comportamiento, salud, o progreso para mascotas específicas",
      "Las alertas activas aparecen en el Dashboard",
      "Márcalas como resueltas cuando se solucione la situación"
    ]
  },
];

export function GuidePage() {
  const [open, setOpen] = useState<string | null>("inicio");

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl">
      <PageHeader title="Guía de Uso" subtitle="Manual de operación del sistema Pethijos Admin" />

      <div className="space-y-3">
        {sections.map(s => (
          <div key={s.id} className="card overflow-hidden">
            <button
              onClick={() => setOpen(open === s.id ? null : s.id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="font-semibold text-gray-800">{s.title}</span>
              <span className="text-gray-400 text-lg">{open === s.id ? "−" : "+"}</span>
            </button>
            {open === s.id && (
              <div className="px-5 pb-5 border-t border-gray-100">
                {s.content && (
                  <p className="text-sm text-gray-600 mt-3 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: s.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                )}
                {s.steps && (
                  <ol className="mt-3 space-y-2">
                    {s.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm text-gray-600">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <span dangerouslySetInnerHTML={{ __html: step.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}
