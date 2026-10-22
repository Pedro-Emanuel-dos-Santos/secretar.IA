const dayKey=(date:Date,zone:string)=>{
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date).map(part=>[part.type,part.value]));
 return Date.UTC(+parts.year,+parts.month-1,+parts.day);
};
export const counted=(count:number,singular:string,plural:string)=>`${count} ${count===1?singular:plural}`;
export function spokenMoment(date:Date,zone:string,reference=new Date()){
 const difference=(dayKey(date,zone)-dayKey(reference,zone))/86400000;
 const day=difference===0?"hoje":difference===1?"amanhã":`dia ${new Intl.DateTimeFormat("pt-BR",{timeZone:zone,dateStyle:"short"}).format(date)}`;
 const time=new Intl.DateTimeFormat("pt-BR",{timeZone:zone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
 return `${day} às ${time}`;
}
export function reminderQuestion(draft:{date:string|null;time:string|null}|null|undefined,zone:string,reference=new Date()){
 if(draft?.date && /^\d{4}-\d{2}-\d{2}$/.test(draft.date)){
  const [year,month,day]=draft.date.split("-").map(Number),difference=(Date.UTC(year,month-1,day)-dayKey(reference,zone))/86400000;
  const label=difference===0?"hoje":difference===1?"amanhã":`no dia ${String(day).padStart(2,"0")}/${String(month).padStart(2,"0")}/${year}`;
  return `Que horas você quer que eu te lembre ${label}?`;
 }
 if(draft?.time)return `Às ${draft.time}. Em qual dia você quer esse lembrete?`;
 return "Em qual dia e horário você quer que eu te lembre?";
}
export function appointmentQuestion(draft:{date:string|null;time:string|null}|null|undefined){
 if(draft?.date)return "Que horas será o compromisso?";
 if(draft?.time)return `Às ${draft.time}. Em qual dia será o compromisso?`;
 return "Em qual dia e horário será o compromisso?";
}
export function alertOffset(minutes:number){
 if(minutes===0)return "na hora";
 const hours=Math.floor(minutes/60),rest=minutes%60;
 return [hours?counted(hours,"hora","horas"):"",rest?counted(rest,"minuto","minutos"):""].filter(Boolean).join(" e ")+" antes";
}
