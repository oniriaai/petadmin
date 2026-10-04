import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { clientsApi, type ClientListRecord } from "../../modules/shared/api";
import { fmtCurrency, fmtDateTimeLocalInput } from "../../lib/utils";
import {
  TRIAGE,
  VISIT_TYPES,
  errorMessage,
  veterinariaApi,
  type ClinicRoom,
  type VetService,
  type VetStaff,
  type VisitSummary,
} from "./api";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (visit: VisitSummary) => void;
  services: VetService[];
  staff: VetStaff[];
  rooms: ClinicRoom[];
  /** Preselect and lock the patient, when opened from a clinical history. */
  patientClientId?: string;
  patientPetId?: string;
  /** `yyyy-MM-dd`: the day the agenda is showing, the default for a scheduled visit. */
  day: string;
}

export function NuevaConsultaModal({
  open,
  onClose,
  onCreated,
  services,
  staff,
  rooms,
  patientClientId,
  patientPetId,
  day,
}: Props) {
  const patient = Boolean(patientClientId && patientPetId);
  const [clients, setClients] = useState<ClientListRecord[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [petId, setPetId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [type, setType] = useState("CONSULTA");
  const [triage, setTriage] = useState("NORMAL");
  const [veterinarianId, setVeterinarianId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setClientSearch("");
    setClientId(patientClientId ?? "");
    setPetId(patientPetId ?? "");
    setServiceId("");
    setType("CONSULTA");
    setTriage("NORMAL");
    setVeterinarianId("");
    setRoomId("");
    setWalkIn(false);
    setDurationMinutes(30);
    setReason("");
    const start = new Date(`${day}T00:00:00`);
    const now = new Date();
    // Next half hour today; opening time on any other day.
    if (start.toDateString() === now.toDateString()) {
      start.setHours(now.getHours(), now.getMinutes() < 30 ? 30 : 60, 0, 0);
    } else {
      start.setHours(9, 0, 0, 0);
    }
    setStartTime(fmtDateTimeLocalInput(start));
    clientsApi
      .list("?status=active")
      .then(setClients)
      .catch((e) => setError(errorMessage(e, "No se pudieron cargar los tutores")));
  }, [open, patientClientId, patientPetId, day]);

  const visibleClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) =>
      `${client.firstName} ${client.lastName} ${client.pets.map((p) => p.name).join(" ")}`
        .toLowerCase()
        .includes(term),
    );
  }, [clients, clientSearch]);

  const pets = clients.find((client) => client.id === clientId)?.pets ?? [];
  const attending = staff.filter((member) => !member.isExternal);
  const service = services.find((s) => s.id === serviceId);

  const selectClient = (id: string) => {
    setClientId(id);
    const owned = clients.find((client) => client.id === id)?.pets ?? [];
    setPetId(owned.length === 1 ? owned[0].id : "");
  };

  const selectService = (id: string) => {
    setServiceId(id);
    const picked = services.find((s) => s.id === id);
    if (picked) setDurationMinutes(picked.durationMinutes);
  };

  const submit = async () => {
    if (!clientId || !petId) {
      setError("Elige el tutor y el paciente.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const visit = await veterinariaApi.createVisit({
        clientId,
        petId,
        type,
        triage,
        durationMinutes,
        ...(serviceId ? { serviceId } : {}),
        ...(veterinarianId ? { veterinarianId } : {}),
        ...(roomId ? { roomId } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(walkIn ? {} : { startTime: new Date(startTime).toISOString() }),
      });
      onCreated(visit);
    } catch (e) {
      setError(errorMessage(e, "No se pudo registrar la consulta"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva consulta"
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Spinner size={16} /> : walkIn ? "Pasar a sala de espera" : "Agendar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="notice notice-danger" role="alert">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="nc-client">
              Tutor
            </label>
            {!patient && (
              <input
                className="input mb-2"
                placeholder="Buscar tutor o paciente"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                aria-label="Buscar tutor o paciente"
              />
            )}
            <select
              id="nc-client"
              className="input"
              value={clientId}
              onChange={(e) => selectClient(e.target.value)}
              disabled={patient}
            >
              <option value="">Selecciona un tutor</option>
              {visibleClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.lastName} {client.firstName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="nc-pet">
              Paciente
            </label>
            <select
              id="nc-pet"
              className={patient ? "input" : "input sm:mt-[50px]"}
              value={petId}
              onChange={(e) => setPetId(e.target.value)}
              disabled={!clientId || patient}
            >
              <option value="">
                {clientId && pets.length === 0 ? "Este tutor no tiene pacientes" : "Selecciona"}
              </option>
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.name} {pet.breed ? `· ${pet.breed}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="nc-service">
              Servicio
            </label>
            <select
              id="nc-service"
              className="input"
              value={serviceId}
              onChange={(e) => selectService(e.target.value)}
            >
              <option value="">Sin servicio (se cobra al cerrar)</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {fmtCurrency(s.basePrice)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="nc-type">
              Tipo
            </label>
            <select
              id="nc-type"
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(VISIT_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="nc-vet">
              Veterinario
            </label>
            <select
              id="nc-vet"
              className="input"
              value={veterinarianId}
              onChange={(e) => setVeterinarianId(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {attending.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="nc-room">
              Sala
            </label>
            <select
              id="nc-room"
              className="input"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            >
              <option value="">Sin sala</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="nc-triage">
              Prioridad
            </label>
            <select
              id="nc-triage"
              className="input"
              value={triage}
              onChange={(e) => setTriage(e.target.value)}
            >
              {Object.entries(TRIAGE).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} />
          El paciente ya está en la clínica (sin cita)
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          {!walkIn && (
            <div className="sm:col-span-2">
              <label className="label" htmlFor="nc-start">
                Fecha y hora
              </label>
              <input
                id="nc-start"
                type="datetime-local"
                className="input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="label" htmlFor="nc-duration">
              Duración (min)
            </label>
            <input
              id="nc-duration"
              type="number"
              min={5}
              step={5}
              className="input"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="nc-reason">
            Motivo de consulta
          </label>
          <textarea
            id="nc-reason"
            className="input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lo que cuenta el tutor"
          />
        </div>

        {triage === "URGENCIA" && (
          <p className="text-xs text-muted">
            Una urgencia se registra aunque el veterinario o la sala tengan otra cita a esa hora.
          </p>
        )}
        {service && triage !== "URGENCIA" && (
          <p className="text-xs text-muted">
            {service.name}: {service.durationMinutes} min, {fmtCurrency(service.basePrice)} antes de
            IVA.
          </p>
        )}
      </div>
    </Modal>
  );
}
