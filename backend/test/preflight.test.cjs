require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {deploymentPreflight}=require('../src/domain/preflight.ts');
const base={DATABASE_URL:'postgresql://user:secret@postgres:5432/app',REDIS_URL:'redis://redis:6379',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_ACCESS_TOKEN:'token'};
test('preflight separa requisitos dos serviços e não imprime valores secretos',()=>{
 assert.equal(deploymentPreflight(base,'reminders').ok,true);
 assert.equal(deploymentPreflight(base,'api').ok,false);
 const report=deploymentPreflight({...base,AI_MODE:'openai'},'inbox');
 assert.ok(report.issues.some(i=>i.key==='OPENAI_API_KEY'));
 assert.doesNotMatch(JSON.stringify(report),/secret@|postgresql:\/\//);
});
test('preflight impede publicar caminhos Windows e bancos localhost em contêiner',()=>{
 const report=deploymentPreflight({...base,DATABASE_URL:'postgresql://user:secret@localhost:5432/app',AI_MODE:'ollama',WHATSAPP_AUDIO_ENABLED:'true',WHATSAPP_AUDIO_ALLOWED_PHONES:'5511999990000',LOCAL_WHISPER_PYTHON:'C:/python/python.exe',LOCAL_WHISPER_CACHE:'C:/models'},'inbox',true);
 assert.equal(report.ok,false);assert.ok(report.issues.some(i=>i.key==='LOCAL_WHISPER_PYTHON'));assert.ok(report.issues.some(i=>i.key==='DATABASE_URL'));
});
