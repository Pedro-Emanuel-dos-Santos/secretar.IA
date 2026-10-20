const {test}=require('node:test');const assert=require('node:assert/strict');
const {redisOptions}=require('../src/config/redis.ts');
test('Redis gerenciado aceita TLS, autenticação e banco sem desativar certificado',()=>{
 const result=redisOptions({REDIS_URL:'rediss://default:p%40ss@example.com:6380/2'});
 assert.equal(result.host,'example.com');assert.equal(result.password,'p@ss');assert.equal(result.db,2);assert.deepEqual(result.tls,{});
 assert.equal(result.maxRetriesPerRequest,null);
});
test('Redis local mantém configuração e rejeita protocolo ou porta inválidos',()=>{
 assert.equal(redisOptions({}).host,'localhost');assert.equal(redisOptions({}).port,6379);
 for(const env of [{REDIS_URL:'https://example.com'},{REDIS_PORT:'abc'},{REDIS_URL:'redis://host/-1'}])assert.throws(()=>redisOptions(env));
});
