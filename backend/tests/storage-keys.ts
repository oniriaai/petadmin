import assert from "node:assert/strict";
import {
  buildPetPhotoKey,
  daycarePrefix,
  isOwnKey,
  namesForeignPrefix,
  resolveObjectKey,
  sanitizeSegment,
  tenantOfKey,
} from "../src/core/storage/object-keys";

const BUCKET = "pethijos-media";
const ENDPOINT = "s3.us-east-005.backblazeb2.com";

// --- sanitizeSegment ---------------------------------------------------------
assert.equal(sanitizeSegment("Max"), "Max");
assert.equal(sanitizeSegment("García Pérez"), "Garc_a_P_rez");
assert.equal(sanitizeSegment("a/b"), "a_b", "separators must not survive sanitizing");
assert.equal(sanitizeSegment("..."), null, "a dots-only segment yields nothing usable");
assert.equal(sanitizeSegment(".."), null, "a bare traversal segment yields nothing usable");
assert.equal(sanitizeSegment("."), null);
// The invariant is one segment that is not itself a traversal - embedded dots are harmless.
for (const hostileInput of ["../../etc", "..%2f..", "a/../b", "....//"]) {
  const out = sanitizeSegment(hostileInput);
  if (out !== null) {
    assert.ok(!out.includes("/"), `segment must not contain a separator: ${out}`);
    assert.ok(out !== "." && out !== "..", `segment must not be a traversal: ${out}`);
  }
}
assert.equal(sanitizeSegment("   "), null);
assert.ok((sanitizeSegment("x".repeat(500)) ?? "").length <= 80, "segments are length-capped");

// --- buildPetPhotoKey -------------------------------------------------------
const key = buildPetPhotoKey({
  daycareId: "daycare_pethijos",
  petName: "Max",
  ownerName: "María",
  fileName: "foto perfil.jpg",
  timestamp: 1,
});
assert.equal(key, "daycares/daycare_pethijos/pets/Max_Mar_a/1-foto_perfil.jpg");

// Two daycares with the same pet and owner names must not share a prefix.
const a = buildPetPhotoKey({
  daycareId: "daycare_a",
  petName: "Toby",
  ownerName: "García",
  fileName: "x.jpg",
  timestamp: 1,
});
const b = buildPetPhotoKey({
  daycareId: "daycare_b",
  petName: "Toby",
  ownerName: "García",
  fileName: "x.jpg",
  timestamp: 1,
});
assert.notEqual(a, b, "identical pet/owner names in different daycares must not collide");
assert.ok(a.startsWith(daycarePrefix("daycare_a")), a);
assert.ok(b.startsWith(daycarePrefix("daycare_b")), b);
assert.equal(
  a.startsWith(daycarePrefix("daycare_b")),
  false,
  "one tenant's prefix must not match another's",
);

// A hostile daycareId cannot break out of the tenant segment either.
const injected = buildPetPhotoKey({
  daycareId: "../other",
  petName: "Max",
  ownerName: "M",
  fileName: "x.jpg",
  timestamp: 1,
});
assert.equal(injected.split("/").length, 5, injected);
assert.ok(injected.startsWith("daycares/"), injected);
for (const segment of injected.split("/")) {
  assert.ok(segment !== "." && segment !== ".." && segment.length > 0, injected);
}
assert.throws(
  () => buildPetPhotoKey({ daycareId: "...", petName: "Max", ownerName: "M", fileName: "x.jpg" }),
  /daycareId inválido/,
);

// A hostile petName cannot escape the pets/ prefix (this was the live traversal bug).
const hostile = buildPetPhotoKey({
  daycareId: "daycare_pethijos",
  petName: "../../../secrets",
  ownerName: "../..",
  fileName: "../../x.jpg",
  timestamp: 1,
});
assert.ok(
  hostile.startsWith("daycares/daycare_pethijos/pets/"),
  `expected tenant prefix, got ${hostile}`,
);
const hostileSegments = hostile.split("/");
assert.equal(hostileSegments.length, 5, `expected exactly 5 segments, got ${hostile}`);
for (const segment of hostileSegments) {
  assert.ok(segment !== "." && segment !== "..", `no segment may be a traversal: ${hostile}`);
  assert.ok(segment.length > 0, `no segment may be empty: ${hostile}`);
}

// Empty-ish input still produces a well-formed key rather than "pets//-".
const fallback = buildPetPhotoKey({
  daycareId: "d1",
  petName: "  ",
  ownerName: "...",
  fileName: "",
  timestamp: 7,
});
assert.equal(fallback, "daycares/d1/pets/mascota_tutor/7-archivo");

// --- resolveObjectKey -------------------------------------------------------
assert.equal(
  resolveObjectKey("pets/Max_Maria/1-a.jpg", BUCKET, ENDPOINT),
  "pets/Max_Maria/1-a.jpg",
);
// virtual-host style
assert.equal(
  resolveObjectKey(`https://${BUCKET}.${ENDPOINT}/pets/Max/1-a.jpg`, BUCKET, ENDPOINT),
  "pets/Max/1-a.jpg",
);
// path style, bucket in the path
assert.equal(
  resolveObjectKey(`https://${ENDPOINT}/${BUCKET}/pets/Max/1-a.jpg`, BUCKET, ENDPOINT),
  "pets/Max/1-a.jpg",
);
// percent-encoded names round-trip
assert.equal(
  resolveObjectKey(`https://${BUCKET}.${ENDPOINT}/pets/Mar%C3%ADa/1-a.jpg`, BUCKET, ENDPOINT),
  "pets/María/1-a.jpg",
);
// refusals
assert.equal(resolveObjectKey("", BUCKET, ENDPOINT), null);
assert.equal(resolveObjectKey("   ", BUCKET, ENDPOINT), null);
assert.equal(
  resolveObjectKey("../../etc/passwd", BUCKET, ENDPOINT),
  null,
  "traversal must be refused",
);
assert.equal(resolveObjectKey("pets/../../etc", BUCKET, ENDPOINT), null);
assert.equal(resolveObjectKey("pets//double", BUCKET, ENDPOINT), null);
assert.equal(resolveObjectKey("pets\\win", BUCKET, ENDPOINT), null);
assert.equal(resolveObjectKey("/", BUCKET, ENDPOINT), null);
// A foreign host must be refused. The URL parser normalizes "/../../x" to "/x", so only
// the host check makes this unusable.
assert.equal(resolveObjectKey("https://evil.example.com/../../x", BUCKET, ENDPOINT), null);
assert.equal(resolveObjectKey(`https://evil.example.com/pets/Max/1-a.jpg`, BUCKET, ENDPOINT), null);
// A URL with no configured endpoint is refused rather than trusted.
assert.equal(resolveObjectKey(`https://${BUCKET}.${ENDPOINT}/pets/Max/1-a.jpg`, BUCKET, ""), null);

// --- key ownership ----------------------------------------------------------
assert.equal(tenantOfKey("daycares/daycare_a/pets/Max_M/1-a.jpg"), "daycare_a");
assert.equal(tenantOfKey("pets/Max_M/1-a.jpg"), null, "a pre-tenancy key has no owner segment");
assert.equal(isOwnKey(a, "daycare_a"), true);
assert.equal(isOwnKey(a, "daycare_b"), false, "another daycare's key is never one's own");
assert.equal(isOwnKey("daycares/daycare_ab/pets/x/1-a.jpg", "daycare_a"), false, "prefix of an id");
assert.equal(isOwnKey("pets/Max_M/1-a.jpg", "daycare_a"), false);

// A reference a tenant writes may not point into another daycare's prefix, on any host: the
// delete authorization matches the key alone, so the host proves nothing.
assert.equal(namesForeignPrefix(a, "daycare_a"), false);
assert.equal(namesForeignPrefix(a, "daycare_b"), true);
assert.equal(namesForeignPrefix(`https://${ENDPOINT}/${BUCKET}/${a}`, "daycare_a"), false);
assert.equal(namesForeignPrefix(`https://${ENDPOINT}/${BUCKET}/${a}`, "daycare_b"), true);
assert.equal(namesForeignPrefix(`https://evil.example.com/${a}`, "daycare_b"), true);
assert.equal(
  namesForeignPrefix(`https://evil.example.com/${encodeURIComponent(a)}`, "daycare_b"),
  true,
  "percent-encoding must not hide the prefix",
);
assert.equal(namesForeignPrefix("pets/Max_M/1-a.jpg", "daycare_b"), false);
assert.equal(namesForeignPrefix("https://images.example.com/dog.jpg", "daycare_b"), false);

console.log("✓ storage object-key construction and resolution");
