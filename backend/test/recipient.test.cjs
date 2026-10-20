const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveWhatsAppRecipient}=require('../src/domain/whatsapp.recipient.ts');
test('alias explícito usa destinatário autorizado sem alterar outros números',()=>{
 const aliases=JSON.stringify({'551188887777':'5511988887777'});
 assert.equal(resolveWhatsAppRecipient('551188887777',aliases),'5511988887777');
 assert.equal(resolveWhatsAppRecipient('5511999990000',aliases),'5511999990000');
 assert.equal(resolveWhatsAppRecipient('551188887777'),'551188887777');
});
test('configuração inválida de destinatário falha antes do envio',()=>{
 for(const value of ['invalid','null','[]','{"551188887777":"https://example.com"}','{"551188887777":5511988887777}'])assert.throws(()=>resolveWhatsAppRecipient('551188887777',value));
});
