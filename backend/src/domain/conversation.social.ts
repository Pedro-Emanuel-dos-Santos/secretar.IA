import type { AIInterpretation } from "../types/ai.types";

// Only complete acknowledgements. Never match a prefix of a new request.
export function socialAcknowledgement(text:string):AIInterpretation|null {
 const normalized=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[!.,\s]+/g," ").trim();
 if(!/^(?:(?:muito )?(?:obrigado|obrigada|brigado|brigada)(?: mesmo| pela forca)?|valeu(?: mesmo| demais)?|show obrigado pela forca)$/.test(normalized))return null;
 return {action:"conversation",title:null,description:null,datetime:null,amount:null,category:null,reply:"De nada!"};
}
