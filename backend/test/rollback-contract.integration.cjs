// Runs the unchanged production delivery/claim code against fictional persisted
// states. No transport call may occur when rolling back an uncertain send.
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const url=require('./integration.database.cjs'),{createPrismaClient}=require('../dist/config/database.js');
const {deliverReminder}=require('../dist/domain/reminder.delivery.js'),{relayReplies}=require('../dist/domain/reply.relay.js');
if(process.env.NODE_ENV!=='test')throw Error('fixture_only');
const prisma=createPrismaClient(url),account='rollback-'+randomUUID();let userId;
after(async()=>{if(userId)await prisma.user.delete({where:{id:userId}});await prisma.incomingMessage.deleteMany({where:{phoneNumberId:account}});await prisma.$disconnect()});
test('unchanged production code never reclaims uncertain/accepted reminders or replies after rollback',async()=>{
 const user=await prisma.user.create({data:{phone:'5595'+String(Date.now()).slice(-11)}});userId=user.id;let sent=0;
 const send=async()=>{sent++;throw Error('fictional sender must remain unused')};
 for(const status of ['sending','delivery_unknown','provider_accepted']){
  const r=await prisma.reminder.create({data:{userId,title:'Fictional rollback',remindAt:new Date('2099-07-20'),status,scheduleOutbox:{create:{phoneNumberId:account}}}});
  assert.equal(await deliverReminder(r.id,account,prisma,send,0),'skipped');assert.equal((await prisma.reminder.findUnique({where:{id:r.id}})).status,status);
  const message=await prisma.incomingMessage.create({data:{providerMessageId:randomUUID(),phoneNumberId:account,phone:user.phone,text:'Fictional rollback only',status:status==='sending'?'reply_sending':status==='delivery_unknown'?'reply_unknown':'completed'}});
  const reply=await prisma.replyOutbox.create({data:{messageId:message.id,status,text:'Fictional reply'}});
  assert.equal(await relayReplies(prisma,send,account),0);assert.equal((await prisma.replyOutbox.findUnique({where:{id:reply.id}})).status,status);
 }
 assert.equal(sent,0);
});
