require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setAudioConsent,executePreferences}=require('../src/domain/preferences.ts');
const {executeLocalCommand}=require('../src/domain/local.commands.ts');

function fixture(disclosure=null,replyStatus='provider_accepted',origin={phone:'5511999990000',phoneNumberId:'audio-test'}){
 const events=[],writes=[];
 const tx={
  user:{upsert:async()=>({id:'owner'})},
  event:{
   create:async({data})=>{events.push(data);return data;},
   findFirst:async({where})=>{
    if(!disclosure || disclosure.createdAt<where.createdAt.gte)return null;
    if(!where.AND.every(filter=>disclosure.payload[filter.payload.path[0]]===filter.payload.equals))return null;
    return disclosure;
   },
  },
  incomingMessage:{findFirst:async({where})=>where.id===disclosure?.payload.sourceMessageId && where.phone===origin.phone && where.phoneNumberId===origin.phoneNumberId && where.reply.status===replyStatus?{id:where.id}:null},
  contactPreference:{upsert:async(args)=>{writes.push(args);return args.create;}},
 };
 return {tx,events,writes};
}
const disclosure=(extra={})=>({createdAt:new Date(),payload:{phoneNumberId:'audio-test',provider:'local',version:1,sourceMessageId:'explained-in',...extra}});
const phone='5511999990000',account='audio-test';

test('aceite de áudio exige explicação aceita pelo provedor antes de habilitar transcrição',async()=>{
 const old=process.env.AUDIO_TRANSCRIPTION_PROVIDER;process.env.AUDIO_TRANSCRIPTION_PROVIDER='local';
 try{
  for(const status of ['pending','sending','delivery_unknown','provider_rejected','cancelled']){
   const f=fixture(disclosure(),status);
   assert.match(await setAudioConsent(phone,account,true,f.tx,'accept-in'),/ACEITO AUDIO/);
   assert.equal(f.writes.length,0,status);
   assert.equal(f.events[0].payload.sourceMessageId,'accept-in');
  }
  const accepted=fixture(disclosure());
  assert.match(await setAudioConsent(phone,account,true,accepted.tx,'accept-in'),/Registrei/);
  assert.equal(accepted.writes[0].create.audioConsent,true);
  assert.equal(accepted.writes[0].create.audioConsentProvider,'local');
 }finally{if(old===undefined)delete process.env.AUDIO_TRANSCRIPTION_PROVIDER;else process.env.AUDIO_TRANSCRIPTION_PROVIDER=old;}
});

test('explicação de áudio antiga, sem origem ou de outra conta/contato/provedor não autoriza',async()=>{
 const old=process.env.AUDIO_TRANSCRIPTION_PROVIDER;process.env.AUDIO_TRANSCRIPTION_PROVIDER='local';
 try{
  const expired=disclosure();expired.createdAt=new Date(Date.now()-86400001);
  const invalid=[fixture(),fixture(expired),fixture(disclosure({sourceMessageId:null})),fixture(disclosure({version:0})),fixture(disclosure({provider:'openai'})),fixture(disclosure({phoneNumberId:'other'})),fixture(disclosure(),'provider_accepted',{phone:'5511888880000',phoneNumberId:account}),fixture(disclosure(),'provider_accepted',{phone,phoneNumberId:'other'})];
  for(const f of invalid){assert.match(await setAudioConsent(phone,account,true,f.tx,'accept-in'),/ACEITO AUDIO/);assert.equal(f.writes.length,0);}
 }finally{if(old===undefined)delete process.env.AUDIO_TRANSCRIPTION_PROVIDER;else process.env.AUDIO_TRANSCRIPTION_PROVIDER=old;}
});

test('comando e pedido interpretado vinculam divulgação de áudio à mensagem que receberá a explicação',async()=>{
 const f=fixture();
 await executeLocalCommand('audio_info',phone,account,f.tx,{id:'local-in',text:'AUDIO'});
 await executePreferences(phone,account,{action:'set_preferences',audioConsent:true},f.tx,'interpreted-in');
 assert.deepEqual(f.events.map(e=>e.payload.sourceMessageId),['local-in','interpreted-in']);
 assert.ok(f.events.every(e=>e.payload.version===1));
 assert.equal(f.writes.length,0);
});

test('revogar áudio não depende de explicação entregue',async()=>{
 const f=fixture();
 assert.match(await setAudioConsent(phone,account,false,f.tx),/Retirei/);
 assert.equal(f.writes[0].update.audioConsent,false);
 assert.equal(f.writes[0].update.audioConsentProvider,null);
});
