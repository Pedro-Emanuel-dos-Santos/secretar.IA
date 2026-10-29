// Offline fixture validation. No .env, credential lookup, Meta query or sending.
// Run: node --import tsx scripts/check-reminder-template-spec.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
globalThis.fetch = async () => { throw new Error('Network forbidden in template specification check'); };
const { verifiedTemplate } = require('../src/services/whatsapp-template.service.ts');
const { whatsappPayload } = require('../src/domain/whatsapp.policy.ts');
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../templates/secretaria_lembrete_v1.json'), 'utf8'));
assert.equal(spec.name, 'secretaria_lembrete_v1');
assert.equal(spec.language, 'pt_BR');
assert.equal(spec.category, 'UTILITY');
assert.equal(spec.parameter_format, 'POSITIONAL');
assert.equal(spec.components.length, 1);
assert.deepEqual([...spec.components[0].text.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]), ['1']);
const row = { ...spec, status: 'APPROVED' }; // Fixture status, never claims actual approval.
assert.equal(verifiedTemplate({ data: [row] }, spec.name, spec.language).parameterCount, 1);
for (const invalid of [
  { ...row, status: 'PENDING' },
  { ...row, category: 'MARKETING' },
  { ...row, language: 'en_US' },
  { ...row, components: [...spec.components, { type: 'HEADER', format: 'TEXT', text: 'Header' }] },
  { ...row, components: [{ type: 'BODY', text: 'Lembrete {{2}}' }] },
]) assert.throws(() => verifiedTemplate({ data: [invalid] }, spec.name, spec.language));
const payload = whatsappPayload('5500000000001', '⏰ Lembrete: Revisar o portfólio', null, 'reminder',
  { name: spec.name, language: spec.language, approved: true }, Date.parse('2026-11-04T12:00:00Z'));
assert.equal(payload.type, 'template');
assert.equal(payload.template.name, spec.name);
assert.equal(payload.template.language.code, 'pt_BR');
assert.deepEqual(payload.template.components, [{ type: 'body', parameters: [{ type: 'text', text: '⏰ Lembrete: Revisar o portfólio' }] }]);
console.log(JSON.stringify({ fixtureOnly: true, contractCompatible: true, rejectedIncompatibleFixtures: 5, metaApprovalVerified: false, messageSends: 0 }));
