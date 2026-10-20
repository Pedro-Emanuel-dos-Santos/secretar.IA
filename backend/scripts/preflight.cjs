// Read-only. Report variable names and problems, never credentials or URL values.
const {deploymentPreflight}=require('../dist/domain/preflight');
const fs=require('node:fs'),path=require('node:path');
const role=process.argv[2];
if(!['api','inbox','reminders'].includes(role)){
 console.error('Uso: node --env-file=../.env scripts/preflight.cjs api|inbox|reminders [--production]');process.exit(2);
}
const result=deploymentPreflight(process.env,role,process.argv.includes('--production'));
if(role==='inbox' && process.env.WHATSAPP_AUDIO_ENABLED==='true' && (process.env.AUDIO_TRANSCRIPTION_PROVIDER||'local')==='local'){
 for(const key of ['LOCAL_WHISPER_PYTHON','LOCAL_WHISPER_CACHE']){
  const value=process.env[key];
  if(value && (!path.isAbsolute(value)||!fs.existsSync(value)))result.issues.push({level:'error',key,message:'Caminho local ausente ou inválido neste computador.'});
 }
}
result.ok=!result.issues.some(i=>i.level==='error');
console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:1;
