import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  availableChannels,
  sanitizeTemplateParam,
  toE164,
  toEmailAddress,
} from "../src/core/messaging";
import { toReminderSettings } from "../src/core/tenancy/unit-settings";
import { RECORDATORIOS_MODULE_ID, recordatoriosRouter } from "../src/modules/recordatorios";
import { resolveChannel } from "../src/modules/recordatorios/due.service";
import { renderEmailHtml, renderEmailText } from "../src/modules/recordatorios/email-layout";
import {
  MESSAGE_TEMPLATES,
  REMINDER_KINDS,
  WHATSAPP_FOOTER,
  fillTemplate,
  joinNames,
  renderReminder,
  type ReminderContent,
} from "../src/modules/recordatorios/templates";
import { backendModules } from "../src/platform/module-registry";
import {
  DEFAULT_ENABLED_PRODUCT_MODULES,
  getProductModule,
  productModuleForBackendId,
} from "../src/platform/product-modules";

// --- Composition -------------------------------------------------------------------------------

const mounted = backendModules.find((module) => module.id === "reminders");
assert.equal(mounted?.router, recordatoriosRouter);
assert.equal(mounted?.basePath, "/reminders");
assert.equal(productModuleForBackendId("reminders")?.id, RECORDATORIOS_MODULE_ID);
// Sold, not given: every WhatsApp message is paid for.
assert.equal(getProductModule(RECORDATORIOS_MODULE_ID)?.core, undefined);
assert.equal(DEFAULT_ENABLED_PRODUCT_MODULES.includes(RECORDATORIOS_MODULE_ID), false);
// Every unit has something to remind about.
assert.deepEqual(mounted?.access?.businessUnits, ["DAYCARE", "GROOMING", "VETERINARY"]);
assert.equal(mounted?.access?.roles.includes("superadmin"), false);

// --- Phone numbers -----------------------------------------------------------------------------

assert.equal(toE164("0991234567", "593"), "593991234567", "national mobile with trunk zero");
assert.equal(toE164("099 123 4567", "593"), "593991234567", "spaces");
assert.equal(toE164("991234567", "593"), "593991234567", "no trunk zero");
assert.equal(toE164("+593 99 123 4567", "593"), "593991234567", "already international");
assert.equal(toE164("593991234567", "593"), "593991234567", "international without plus");
assert.equal(toE164("00593991234567", "593"), "593991234567", "00 prefix");
assert.equal(toE164("+1 (415) 555-2671", "593"), "14155552671", "another country is kept");
assert.equal(toE164("022345678", "593"), "59322345678", "landline");
for (const bad of ["", "   ", "abc", "12", "+", null, undefined, "1".repeat(20)]) {
  assert.equal(toE164(bad, "593"), null, `"${bad}" is not a number`);
}
assert.equal(toEmailAddress("  ana@example.com "), "ana@example.com");
for (const bad of ["", "ana", "ana@", "ana@example", "a b@example.com", null]) {
  assert.equal(toEmailAddress(bad), null, `"${bad}" is not an address`);
}
assert.equal(sanitizeTemplateParam("Luna\n y\t  Max "), "Luna y Max");

// --- Channel choice ----------------------------------------------------------------------------

const both = { channels: ["WHATSAPP", "EMAIL"], defaultChannel: "WHATSAPP" } as const;
const usable = ["WHATSAPP", "EMAIL"] as const;
const tutor = {
  phone: "0991234567",
  whatsapp: null,
  email: "ana@example.com",
  isActive: true,
  reminderChannel: null,
};

assert.deepEqual(
  resolveChannel(tutor, { ...both, channels: [...both.channels] }, usable),
  { channel: "WHATSAPP", recipient: "593991234567", skipReason: null },
  "no preference follows the unit's default, and the phone stands in for a WhatsApp number",
);
const settings = { channels: [...both.channels], defaultChannel: both.defaultChannel };
assert.equal(
  resolveChannel({ ...tutor, reminderChannel: "EMAIL" }, settings, usable).channel,
  "EMAIL",
  "the tutor's preference beats the default",
);
assert.equal(
  resolveChannel({ ...tutor, whatsapp: "0987654321" }, settings, usable).recipient,
  "593987654321",
  "a WhatsApp number beats the phone",
);
assert.equal(
  resolveChannel({ ...tutor, phone: null }, settings, usable).channel,
  "EMAIL",
  "a missing contact falls back to the other channel",
);
assert.equal(
  resolveChannel({ ...tutor, reminderChannel: "EMAIL", email: "" }, settings, usable).channel,
  "WHATSAPP",
  "even when the missing one is the preferred one",
);
assert.equal(resolveChannel({ ...tutor, reminderChannel: "NONE" }, settings, usable).channel, null);
assert.equal(
  resolveChannel({ ...tutor, reminderChannel: "NONE" }, settings, usable, "EMAIL").channel,
  null,
  "nothing overrides an opt-out, not even a channel picked by hand",
);
assert.equal(resolveChannel({ ...tutor, isActive: false }, settings, usable).channel, null);
assert.equal(
  resolveChannel({ ...tutor, phone: null, email: null }, settings, usable).channel,
  null,
);
assert.equal(
  resolveChannel(tutor, { channels: ["EMAIL"], defaultChannel: "EMAIL" }, usable).channel,
  "EMAIL",
  "a channel the unit switched off is not used",
);
assert.equal(
  resolveChannel(tutor, settings, ["EMAIL"]).channel,
  "EMAIL",
  "nor one the platform cannot send on",
);
assert.equal(resolveChannel(tutor, settings, []).channel, null);
assert.equal(resolveChannel(tutor, settings, usable, "EMAIL").channel, "EMAIL", "picked by hand");
assert.equal(
  resolveChannel({ ...tutor, email: null }, settings, usable, "EMAIL").channel,
  null,
  "a channel picked by hand does not fall back: the person asked for that one",
);

// --- Settings defaults -------------------------------------------------------------------------

const unconfigured = toReminderSettings(null);
assert.equal(unconfigured.auto, false, "automatic sending is opt-in");
assert.deepEqual(unconfigured.channels, ["WHATSAPP", "EMAIL"]);
assert.equal(unconfigured.leadDays, 7);
assert.equal(
  toReminderSettings({
    remindersAuto: true,
    reminderChannels: ["EMAIL", "SMS"],
    reminderDefaultChannel: "WHATSAPP",
    reminderLeadDays: 3,
    contactPhone: null,
    contactEmail: null,
  }).defaultChannel,
  "EMAIL",
  "a stored default that is no longer an active channel gives way to one that is",
);

// --- Copy --------------------------------------------------------------------------------------

const names = new Set<string>();
for (const [id, template] of Object.entries(MESSAGE_TEMPLATES)) {
  assert.match(template.name, /^[a-z0-9_]+$/, `${id}: Meta template names are lowercase snake`);
  assert.ok(!names.has(template.name), `${id}: duplicate template name`);
  names.add(template.name);

  const placeholders = [...template.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  assert.deepEqual(
    placeholders,
    template.params.map((_param, index) => index + 1),
    `${id}: placeholders must be {{1}}..{{n}}, each once and in order`,
  );
  assert.equal(template.example.length, template.params.length, `${id}: one example per parameter`);
  // Meta refuses a template that starts or ends with a parameter.
  assert.ok(!template.body.startsWith("{{") && !template.body.endsWith("}}"), id);

  const filled = fillTemplate(template.body, template.example);
  assert.ok(!filled.includes("{{"), `${id}: leftover placeholder`);
  // The brand voice: tú, at most one exclamation mark, no emoji.
  assert.ok((filled.match(/!/g) ?? []).length <= 1, `${id}: more than one exclamation mark`);
  assert.ok(!/\p{Extended_Pictographic}/u.test(filled), `${id}: emoji`);
  assert.ok(!/\b(usted|le escribimos|su tutor)\b/i.test(filled), `${id}: not in the tú voice`);
  assert.ok(filled.startsWith("Hola Ana, te escribimos de "), `${id}: names the business first`);
}

// What is registered at Meta is copied from the guide, so the guide must say what the code sends.
// The dev container mounts the backend alone; the check runs wherever the repository is whole.
const guide = path.join(__dirname, "../../docs/recordatorios.md");
if (existsSync(guide)) {
  const text = readFileSync(guide, "utf8");
  for (const [id, template] of Object.entries(MESSAGE_TEMPLATES)) {
    assert.ok(text.includes(`\`${template.name}\``), `${id}: missing from docs/recordatorios.md`);
    assert.ok(text.includes(template.body), `${id}: its body in the guide is out of date`);
  }
  assert.ok(text.includes(WHATSAPP_FOOTER), "the template footer in the guide is out of date");
}

assert.equal(joinNames(["Luna"]), "Luna");
assert.equal(joinNames(["Luna", "Max"]), "Luna y Max");
assert.equal(joinNames(["Luna", "Max", "Toby"]), "Luna, Max y Toby");

const base: ReminderContent = {
  kind: "CITA",
  businessUnit: "GROOMING",
  tutor: "Ana",
  business: "Peluquería Luna",
  pets: "Max",
  subject: "",
  // 15:00 UTC is 10:00 in Guayaquil.
  dueAt: new Date("2026-10-07T15:00:00.000Z"),
  timezone: "America/Guayaquil",
  hasClinic: false,
  contactPhone: "099 123 4567",
  contactEmail: "hola@peluquerialuna.ec",
};

const cita = renderReminder(base, "WHATSAPP");
assert.equal(
  cita.text,
  "Hola Ana, te escribimos de Peluquería Luna. Te recordamos la cita de peluquería de Max el miércoles 7 de octubre a las 10:00. Si necesitas cambiarla, escríbenos al 099 123 4567.",
);
assert.equal(cita.params.length, cita.template.params.length);
assert.ok(
  renderReminder(base, "EMAIL").text.endsWith("escríbenos respondiendo a este correo."),
  "by email the reply goes to the business, so the message says so",
);
assert.ok(
  renderReminder({ ...base, contactPhone: null, contactEmail: null }, "WHATSAPP").params.every(
    (param) => param.trim().length > 0,
  ),
  "a template parameter is never empty, even with no contact configured",
);
// A reservation at 23:30 local is still that local day, though UTC is already the next.
assert.ok(
  renderReminder(
    { ...base, dueAt: new Date("2026-10-08T04:30:00.000Z") },
    "WHATSAPP",
  ).text.includes("el miércoles 7 de octubre a las 23:30"),
);
assert.ok(
  renderReminder({ ...base, businessUnit: "VETERINARY" }, "WHATSAPP").text.includes(
    "la consulta veterinaria de Max",
  ),
);

// A due date is a calendar date stored at midnight UTC: it must not slide to the evening before.
const vaccine = {
  ...base,
  kind: "VACUNA" as const,
  subject: "Antirrábica",
  dueAt: new Date("2026-10-12T00:00:00.000Z"),
};
const notice = renderReminder(vaccine, "WHATSAPP");
assert.equal(notice.template, MESSAGE_TEMPLATES.VACUNA_AVISO, "no clinic: it can only ask");
assert.ok(notice.text.includes("prevista para el 12 de octubre"), notice.text);
assert.equal(
  renderReminder({ ...vaccine, hasClinic: true }, "WHATSAPP").template,
  MESSAGE_TEMPLATES.VACUNA_CLINICA,
  "a clinic offers the appointment",
);
for (const kind of REMINDER_KINDS) {
  const rendered = renderReminder({ ...vaccine, kind }, "EMAIL");
  assert.ok(rendered.subject.length > 0 && rendered.headline.length > 0, kind);
  assert.ok(!rendered.text.includes("{{") && !rendered.text.includes("undefined"), kind);
}

// --- The email ---------------------------------------------------------------------------------

const layout = {
  headline: cita.headline,
  body: cita.text,
  business: "Peluquería <Luna> & Cía",
  pets: "Max",
  contactEmail: "hola@peluquerialuna.ec",
};
const html = renderEmailHtml(layout);
for (const token of ["#faf8f5", "#1c1917", "#ea580c", "#1d4ed8", "Marcellus", "Inter"]) {
  assert.ok(html.includes(token), `the email carries the brand token ${token}`);
}
assert.ok(html.includes("Enviado con Argos Suite"));
assert.ok(html.includes("Peluquería &lt;Luna&gt; &amp; Cía"), "tenant text is escaped");
assert.ok(!html.includes("<Luna>"));
assert.ok(!html.includes("Λ"), "the lambda belongs to the drawn logo only");
assert.ok(html.includes('lang="es"'));
assert.ok(renderEmailText(layout).endsWith("Enviado con Argos Suite"));

const previousSite = process.env.PUBLIC_SITE_URL;
process.env.PUBLIC_SITE_URL = "https://app.example.com/";
assert.ok(
  renderEmailHtml(layout).includes('src="https://app.example.com/brand/argos-suite-lockup.png"'),
);
process.env.PUBLIC_SITE_URL = "";
assert.ok(renderEmailHtml(layout).includes("ARGOS SUITE"), "without a site, the name stands in");
process.env.PUBLIC_SITE_URL = previousSite;

// --- Transports --------------------------------------------------------------------------------

const env = { ...process.env };
delete process.env.WHATSAPP_PHONE_NUMBER_ID;
delete process.env.WHATSAPP_ACCESS_TOKEN;
delete process.env.SMTP_URL;
process.env.NODE_ENV = "development";
assert.deepEqual(availableChannels(), { WHATSAPP: "simulated", EMAIL: "simulated" });
process.env.NODE_ENV = "production";
assert.deepEqual(
  availableChannels(),
  { WHATSAPP: null, EMAIL: null },
  "production never pretends to have sent",
);
process.env.WHATSAPP_PHONE_NUMBER_ID = "1";
process.env.WHATSAPP_ACCESS_TOKEN = "t";
process.env.SMTP_URL = "smtp://localhost";
assert.equal(availableChannels().WHATSAPP, "live");
assert.equal(availableChannels().EMAIL, null, "SMTP alone is not enough: there is no sender");
process.env.MAIL_FROM = "Argos Suite <recordatorios@example.com>";
assert.equal(availableChannels().EMAIL, "live");
process.env = env;

console.log(`✓ reminders module (${Object.keys(MESSAGE_TEMPLATES).length} message templates)`);
