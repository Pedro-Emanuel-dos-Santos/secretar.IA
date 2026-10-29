import type {PrismaClient} from "@prisma/client";
import {contextFeatures,contextScore} from "./context.relevance";
import {personalMemoryPolicy} from "./personal.memory.consent";
import {reminderScope} from "./reminder.management";

type Store=Pick<PrismaClient,"event"|"appointment"|"reminder"|"businessSubject"|"subjectPending">;
export type ContextRecord={id:string;kind:"personal"|"note"|"appointment"|"reminder"|"fact"|"pending";category?:string;title:string;text:string;subjectId?:string;subject?:string;recordedAt:string;updatedAt:string;sourceMessageId:string|null;version:number|null;startsAt?:string;state?:string;score?:number;matchedConcepts?:string[]};
export type ContextRetrieval={method:"concepts-lexical-v1";items:ContextRecord[];ambiguous:boolean;limited:boolean;personalMemoryEnabled:boolean};
const date=(value:Date|string)=>new Date(value).toISOString();
const cap=41;
export async function retrieveContext(store:Store,phone:string,phoneNumberId:string,query:string,now=new Date()):Promise<ContextRetrieval>{
 const policy=await personalMemoryPolicy(store,phone,phoneNumberId),features=contextFeatures(query);
 const empty:ContextRetrieval={method:"concepts-lexical-v1",items:[],ambiguous:false,limited:false,personalMemoryEnabled:policy.enabled};
 if(!features.terms.length)return empty;
 const scope={user:{phone},phoneNumberId};
 const eventText=features.terms.flatMap(term=>[{payload:{path:["searchText"],string_contains:term}},{payload:{path:["text"],string_contains:term}}]);
 const orText=(keys:string[])=>features.terms.flatMap(term=>keys.map(key=>({[key]:{contains:term,mode:"insensitive" as const}})));
 const [events,appointments,reminders,subjects,pendings]=await Promise.all([
  store.event.findMany({where:{user:{phone},type:{in:policy.enabled?["personal_memory","secretary_note"]:["secretary_note"]},AND:[{payload:{path:["phoneNumberId"],equals:phoneNumberId}},{OR:eventText}]},orderBy:[{createdAt:"desc"},{id:"asc"}],take:cap}),
  store.appointment.findMany({where:{...scope,state:"active",OR:[...orText(["title","description"]),{subject:{...scope,OR:orText(["name","normalizedName"])}}]},include:{subject:{select:{name:true,userId:true,phoneNumberId:true}}},orderBy:[{updatedAt:"desc"},{id:"asc"}],take:cap}),
  store.reminder.findMany({where:{state:"active",appointmentId:null,kind:"task",AND:[reminderScope(phone,phoneNumberId),{OR:[...orText(["title","description"]),{subject:{...scope,OR:orText(["name","normalizedName"])}}]}]},include:{subject:{select:{name:true,userId:true,phoneNumberId:true}}},orderBy:[{updatedAt:"desc"},{id:"asc"}],take:cap}),
  store.businessSubject.findMany({where:{...scope,OR:[...orText(["name","normalizedName"]),{facts:{some:{supersededAt:null,OR:orText(["key","value"])}}}]},include:{facts:{where:{supersededAt:null,OR:[...orText(["key","value"]),{subject:{OR:orText(["name","normalizedName"])}}]},orderBy:[{revision:"desc"},{id:"asc"}],take:12}},orderBy:[{updatedAt:"desc"},{id:"asc"}],take:cap}),
  store.subjectPending.findMany({where:{...scope,subject:scope,state:{in:["pending","waiting"]},OR:[...orText(["title","nextAction","waitingFor"]),{subject:{...scope,OR:orText(["name","normalizedName"])}}]},include:{subject:{select:{name:true}}},orderBy:[{updatedAt:"desc"},{id:"asc"}],take:cap}),
 ]);
 const candidates:ContextRecord[]=[];
 for(const row of events){
  const p=row.payload as any;
  if(typeof p?.text!=="string" || row.type==="personal_memory" && (!policy.enabled || !["routine","preference","person","goal"].includes(p.kind)))continue;
  const updated=typeof p.updatedAt==="string" && Number.isFinite(Date.parse(p.updatedAt))?p.updatedAt:row.createdAt;
  candidates.push({id:row.id,kind:row.type==="personal_memory"?"personal":"note",...(row.type==="personal_memory"?{category:p.kind}:{}),title:typeof p.label==="string"?p.label:"Anotação",text:p.text,recordedAt:date(row.createdAt),updatedAt:date(updated),sourceMessageId:typeof p.sourceMessageId==="string"?p.sourceMessageId:null,version:Number.isSafeInteger(p.version)?p.version:0});
 }
 for(const row of appointments)candidates.push({id:row.id,kind:"appointment",title:row.title,text:`${row.title}${row.description?`: ${row.description}`:""}`,...(row.subject && row.subject.userId===row.userId && row.subject.phoneNumberId===phoneNumberId?{subjectId:row.subjectId!,subject:row.subject.name}:{}),recordedAt:date(row.createdAt),updatedAt:date(row.updatedAt),sourceMessageId:row.sourceMessageId,version:row.version,startsAt:date(row.startsAt),state:row.state});
 for(const row of reminders)candidates.push({id:row.id,kind:"reminder",title:row.title,text:`${row.title}${row.description?`: ${row.description}`:""}`,...(row.subject && row.subject.userId===row.userId && row.subject.phoneNumberId===phoneNumberId?{subjectId:row.subjectId!,subject:row.subject.name}:{}),recordedAt:date(row.createdAt),updatedAt:date(row.updatedAt),sourceMessageId:row.sourceMessageId,version:row.scheduleVersion,startsAt:date(row.remindAt),state:row.taskProgress});
 for(const subject of subjects)for(const fact of subject.facts)candidates.push({id:fact.id,kind:"fact",title:`${subject.name}: ${fact.key}`,text:fact.value,subjectId:subject.id,subject:subject.name,recordedAt:date(fact.createdAt),updatedAt:date(fact.createdAt),sourceMessageId:fact.sourceMessageId,version:fact.revision});
 for(const row of pendings)candidates.push({id:row.id,kind:"pending",title:row.title,text:`${row.title}${row.nextAction?`; próxima ação: ${row.nextAction}`:""}${row.waitingFor?`; aguardando ${row.waitingFor}`:""}`,subjectId:row.subjectId,subject:row.subject.name,recordedAt:date(row.createdAt),updatedAt:date(row.updatedAt),sourceMessageId:row.sourceMessageId,version:row.version,state:row.state});
 const ranked=candidates.map(item=>({...item,...contextScore(query,`${item.subject || ""} ${item.title} ${item.text}`)})).filter(r=>r.score>=3).sort((a,b)=>b.score-a.score || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
 const limited=[events,appointments,reminders,subjects,pendings].some(rows=>rows.length===cap) || subjects.some(s=>s.facts.length===12) || ranked.length>6;
 const items:ContextRecord[]=[];let size=0,clipped=false;
 for(const row of ranked.slice(0,6)){
  const item={...row,title:row.title.slice(0,160),text:row.text.slice(0,row.kind==="note"?1500:500)};
  if(item.title.length<row.title.length || item.text.length<row.text.length)clipped=true;
  const length=JSON.stringify(item).length;if(size+length>5000)break;items.push(item);size+=length;
 }
 const group=(r:ContextRecord)=>r.subjectId || r.id;
 const top=items[0];
 const ambiguous=!!top && items.some(r=>group(r)!==group(top) && r.kind===top.kind && r.score!>=top.score!-1);
 return {...empty,items,limited:limited || clipped || items.length<Math.min(6,ranked.length),ambiguous};
}
