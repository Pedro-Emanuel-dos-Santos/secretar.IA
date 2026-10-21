require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {recurrenceDates}=require('../src/domain/recurrence.ts');
const {validTimezone}=require('../src/domain/preferences.ts');
test('série em outro fuso preserva hora local durante mudança de offset',()=>{
 const dates=recurrenceDates('2027-03-13T09:00:00-05:00',{frequency:'daily',count:2},'America/New_York');
 assert.deepEqual(dates.map(d=>d.toISOString()),['2027-03-13T14:00:00.000Z','2027-03-14T13:00:00.000Z']);
 assert.throws(()=>recurrenceDates('2027-03-13T02:30:00-05:00',{frequency:'daily',count:2},'America/New_York'),/inexistente/);
 assert.equal(validTimezone('America/Manaus'),true);assert.equal(validTimezone('inventado/fuso'),false);
});
