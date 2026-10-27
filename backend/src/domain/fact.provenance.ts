type FactOrigin={createdAt:Date;sourceMessage?:{receivedAt:Date;phone:string;phoneNumberId:string}|null};
// A user's report has a source, but is not independently verified evidence.
export function factProvenance(fact:FactOrigin,phone:string,phoneNumberId:string,timezone:string){
 const source=fact.sourceMessage;
 const trusted=source?.phone===phone && source.phoneNumberId===phoneNumberId;
 const date=trusted?source!.receivedAt:fact.createdAt;
 const at=new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,dateStyle:"short",timeStyle:"short"}).format(date);
 return trusted?`Informado por você via WhatsApp em ${at}.`:`Registrado em ${at}; origem da informação não identificada.`;
}
export const factOriginSelection={receivedAt:true,phone:true,phoneNumberId:true} as const;
