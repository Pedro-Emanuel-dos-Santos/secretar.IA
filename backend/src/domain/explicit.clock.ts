// Parse the user's wall clock, never the UTC offset guessed by the model.
// Unknown, multiple and malformed clocks are deliberately not guessed.
const small:Record<string,number>={zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20,trinta:30,quarenta:40,cinquenta:50};
function number(text:string){return /^\d+$/.test(text)?Number(text):text.split(/\s+e\s+/).reduce((n,part)=>n+(small[part] ?? NaN),0);}
const hour='(?:\\d{1,2}|uma|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte(?: e (?:uma|duas|tres))?)';
const minute='(?:\\d{1,2}|meia|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|(?:vinte|trinta|quarenta|cinquenta)(?: e (?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?)';
export function explicitWallClock(text:string):[number,number,number]|null{
 const s=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(/[?]|\b(?:nao|nunca|talvez|se)\b/.test(s))return null;
 const special=s.match(/\b(meio[ -]dia|meia[ -]noite)[.!]*$/);
 if(special){const prefix=s.slice(0,special.index).replace(/(?:as|pelas|por volta das)\s*$/,"");return /\d|\b(?:as|pelas|meio|meia)\b/.test(prefix)?null:[special[1].startsWith('meio')?12:0,0,0];}
 const expression=new RegExp(`(?:^|\\b)(?:as\\s+|pelas\\s+|umas\\s+|por volta das\\s+)?(${hour})(?:(?:h(\\d{2})?|:(\\d{2}))|(?:\\s+horas?)?(?:\\s+e\\s+(${minute})(?:\\s+minutos?)?)?)(?:\\s+(?:da|de|a)\\s+(manha|tarde|noite|madrugada))?[.!]*$`);
 const m=s.match(expression);if(!m)return null;
 const prefix=s.slice(0,m.index);
 if(/\d|\b(?:as|pelas|horas?|meio|meia)\b/.test(prefix))return null;
 let h=number(m[1]),minutes=m[2]!==undefined?Number(m[2]):m[3]!==undefined?Number(m[3]):m[4]==='meia'?30:m[4]?number(m[4]):0;
 if(!Number.isInteger(h)||h<0||h>23||!Number.isInteger(minutes)||minutes<0||minutes>59)return null;
 const period=m[5];
 if(period==='manha' || period==='madrugada'){if(h>=12)return null;}
 else if(period==='tarde' || period==='noite'){if(h===0 || period==='noite' && h===12)return null;if(h<12)h+=12;}
 return [h,minutes,0];
}
