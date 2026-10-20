export type ServiceRole = "api" | "inbox" | "reminders";
export type PreflightIssue = {level:"error" | "warning"; key:string; message:string};
export function deploymentPreflight(env:Record<string,string | undefined>,role:ServiceRole,production=false) {
  const issues:PreflightIssue[]=[];
  const add=(key:string,message:string,level:"error" | "warning"="error")=>issues.push({key,message,level});
  const required=(key:string)=>{
    if (!env[key] || /REPLACE_WITH|YOUR_[A-Z]|COLOQUE_AQUI/i.test(env[key]!)) add(key,"Variável obrigatória ausente ou com valor de exemplo.");
  };
  for(const key of ["DATABASE_URL","WHATSAPP_PHONE_NUMBER_ID"])required(key);
  if (role === "api") for(const key of ["WHATSAPP_APP_SECRET","WHATSAPP_VERIFY_TOKEN","ADMIN_API_TOKEN"])required(key);
  else required("WHATSAPP_ACCESS_TOKEN");
  if (role === "api" && env.ADMIN_API_TOKEN && env.ADMIN_API_TOKEN.length < 32) add("ADMIN_API_TOKEN","Use um token aleatório com pelo menos 32 caracteres.");
  if (env.DATABASE_URL) {
    try {const u=new URL(env.DATABASE_URL);if(!["postgres:","postgresql:"].includes(u.protocol))throw Error();
      if(production && ["localhost","127.0.0.1","[::1]"].includes(u.hostname))add("DATABASE_URL","O banco local não é acessível a partir do ambiente de publicação.");
    }catch{add("DATABASE_URL","URL PostgreSQL inválida.")}
  }
  if (!env.REDIS_URL && !env.REDIS_HOST) add("REDIS_URL",production ? "Configure REDIS_URL ou REDIS_HOST para o serviço." : "Usando o Redis padrão local. Configure o endereço antes de publicar.",production ? "error" : "warning");
  if (production && ["localhost","127.0.0.1","[::1]"].includes(env.REDIS_HOST || "")) add("REDIS_HOST","O Redis local não é acessível a partir do ambiente de publicação.");
  if (env.REDIS_URL) {
    try {const u=new URL(env.REDIS_URL);if(!["redis:","rediss:"].includes(u.protocol))throw Error();
      if(production && ["localhost","127.0.0.1","[::1]"].includes(u.hostname))add("REDIS_URL","O Redis local não é acessível a partir do ambiente de publicação.");
    }catch{add("REDIS_URL","URL Redis inválida.")}
  }
  if (role === "inbox") {
    const mode=env.AI_MODE || "hybrid";
    if (!["openai","ollama","hybrid"].includes(mode))add("AI_MODE","Modo de IA desconhecido.");
    if (mode !== "ollama")required("OPENAI_API_KEY");
    if (env.WHATSAPP_AUDIO_ENABLED === "true") {
      required("WHATSAPP_AUDIO_ALLOWED_PHONES");
      const provider=env.AUDIO_TRANSCRIPTION_PROVIDER || "local";
      if(provider === "local") {
        required("LOCAL_WHISPER_PYTHON");required("LOCAL_WHISPER_CACHE");
        if(production && /^[a-z]:[\\/]/i.test(env.LOCAL_WHISPER_PYTHON || ""))add("LOCAL_WHISPER_PYTHON","Um caminho Windows não existe no contêiner Linux de produção.");
      }else if(provider === "openai")required("OPENAI_API_KEY");
      else add("AUDIO_TRANSCRIPTION_PROVIDER","Provedor de áudio desconhecido.");
    }
  }
  if(role === "reminders") {
    if(env.WHATSAPP_REMINDER_TEMPLATE_APPROVED === "true") {
      required("WHATSAPP_REMINDER_TEMPLATE_NAME");required("WHATSAPP_REMINDER_TEMPLATE_LANGUAGE");
    }else add("WHATSAPP_REMINDER_TEMPLATE_APPROVED","Avisos fora da janela de atendimento serão bloqueados sem template aprovado.","warning");
  }
  for(const [key,defaultValue,max] of [["REMINDER_MAX_LATENESS_MINUTES",60,1440],["REMINDER_MAX_ACTIVE_PER_USER",100,5000],["REMINDER_MAX_CREATED_PER_DAY",50,1000],["MAX_REQUESTS_PER_USER_PER_DAY",200,10000],["MAX_AUDIO_PER_USER_PER_DAY",20,500]] as const){
    const value=env[key] ? Number(env[key]) : defaultValue;
    if(!Number.isSafeInteger(value)||value<1||value>max)add(key,`Informe um inteiro de 1 a ${max}.`);
  }
  return {role,production,ok:!issues.some(i=>i.level === "error"),issues};
}
