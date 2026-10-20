require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {extractMessages}=require('../src/domain/inbox.receiver.ts');
const {audioMime,mediaDownloadUrl,limitedAudio,maxAudioBytes}=require('../src/domain/audio.ts');
test('hash da mídia Meta aceita hexadecimal e Base64 sem aceitar conteúdo alterado',()=>{
 const {matchesMediaHash}=require('../src/domain/audio.ts');
 const bytes=Buffer.from('audio de teste'),digest=require('node:crypto').createHash('sha256').update(bytes).digest();
 for(const expected of [digest.toString('hex'),digest.toString('hex').toUpperCase(),digest.toString('base64')]){
  assert.equal(matchesMediaHash(bytes,expected),true);assert.equal(matchesMediaHash(Buffer.from('alterado'),expected),false);
 }
 assert.equal(matchesMediaHash(bytes,'invalid'),false);
});
test('duração falada usa recebimento em vez do fim da transcrição',()=>{
 const {relativeReminderTime}=require('../src/domain/relative-time.ts');
 const now=new Date('2099-01-01T12:00:00Z');
 assert.equal(relativeReminderTime('Me lembra daqui a dois minutos de ligar para o fornecedor?',now),'2099-01-01T12:02:00.000Z');
 assert.equal(relativeReminderTime('Me lembra daqui a uma hora de ligar',now),'2099-01-01T13:00:00.000Z');
 assert.equal(relativeReminderTime('Me lembra daqui a vinte e cinco minutos de ligar',now),null);
});
test('áudio persiste somente referência e MIME, sem URL nem payload privado',()=>{
 const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'biz'},messages:[{id:'audio1',from:'5511999990000',type:'audio',audio:{id:'123456',mime_type:'audio/ogg; codecs=opus',url:'https://evil.invalid',voice:true}}]}}]}]};
 const rows=extractMessages(payload,'biz');assert.equal(rows[0].mediaId,'123456');assert.equal(rows[0].text,'[Mensagem de voz]');assert.equal(rows[0].url,undefined);
 assert.equal(extractMessages(payload,'other').length,0);
});
test('download rejeita URL arbitrária, credenciais, redirecionamento de origem e formato incompatível',()=>{
 for(const url of ['http://lookaside.fbsbx.com/a','https://lookaside.fbsbx.com.evil.invalid/a','https://127.0.0.1/a','https://user@lookaside.fbsbx.com/a','https://lookaside.fbsbx.com:444/a'])assert.throws(()=>mediaDownloadUrl(url));
 assert.equal(mediaDownloadUrl('https://lookaside.fbsbx.com/a'),'https://lookaside.fbsbx.com/a');
 assert.equal(audioMime('audio/ogg; codecs=opus'),'audio/ogg');assert.throws(()=>audioMime('video/mp4'));
});
test('limite de áudio vale também sem Content-Length e rejeita vazio',async()=>{
 await assert.rejects(limitedAudio(new Response(new Uint8Array(maxAudioBytes+1))));
 await assert.rejects(limitedAudio(new Response(new Uint8Array(0))));
 assert.equal((await limitedAudio(new Response(new Uint8Array([1,2])))).length,2);
});

test('provedor local não usa API paga como fallback quando Python falha',async()=>{
 const {transcribeWhatsAppAudio}=require('../src/services/audio.service.ts');
 const names=['WHATSAPP_AUDIO_ENABLED','WHATSAPP_AUDIO_ALLOWED_PHONES','AUDIO_TRANSCRIPTION_PROVIDER','LOCAL_WHISPER_PYTHON','LOCAL_WHISPER_CACHE','WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID'];
 const before=Object.fromEntries(names.map(k=>[k,process.env[k]])),originalFetch=global.fetch;
 let requests=0;
 try {
  Object.assign(process.env,{WHATSAPP_AUDIO_ENABLED:'true',WHATSAPP_AUDIO_ALLOWED_PHONES:'5511999990000',AUDIO_TRANSCRIPTION_PROVIDER:'local',
   LOCAL_WHISPER_PYTHON:require('node:path').resolve('not-installed-python.exe'),LOCAL_WHISPER_CACHE:'unused',WHATSAPP_ACCESS_TOKEN:'test-token',WHATSAPP_PHONE_NUMBER_ID:'biz'});
  global.fetch=async url=>{
   requests++;assert.ok(String(url).startsWith('https://graph.facebook.com/')||String(url).startsWith('https://lookaside.fbsbx.com/'));
   return requests===1?Response.json({url:'https://lookaside.fbsbx.com/media',mime_type:'audio/wav'}):new Response(new Uint8Array([1,2]));
  };
  await assert.rejects(transcribeWhatsAppAudio({mediaId:'123',mediaMimeType:'audio/wav',phoneNumberId:'biz',phone:'5511999990000'}));
  assert.equal(requests,2);
 }finally{global.fetch=originalFetch;for(const k of names){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k]}}
});
