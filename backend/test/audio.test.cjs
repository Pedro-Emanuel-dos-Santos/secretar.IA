require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {extractMessages}=require('../src/domain/inbox.receiver.ts');
const {audioMime,mediaDownloadUrl,limitedAudio,maxAudioBytes}=require('../src/domain/audio.ts');
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
