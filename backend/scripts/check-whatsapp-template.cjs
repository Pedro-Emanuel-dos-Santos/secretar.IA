// Read-only metadata probe. Never sends a WhatsApp message or edits a template.
if(!process.argv.includes('--allow-meta-read')){console.log('Requires --allow-meta-read. Metadata only; no message sends.');process.exit(0);}
const {verifyReminderTemplate}=require('../dist/services/whatsapp-template.service');
verifyReminderTemplate(process.env).then(result=>console.log(JSON.stringify({verified:true,...result,messageSends:0}))).catch(error=>{
 console.log(JSON.stringify({verified:false,reason:error.reason || 'verification_temporarily_unavailable',messageSends:0}));process.exitCode=1;
});
