// Small, explicit Portuguese concept vocabulary. No embeddings/API, hidden
// memory creation or assumption that every paraphrase is understood.
const concepts:Record<string,string[]>={
 employment:["emprego","trabalho","vaga","carreira","profissão","recolocação"],
 interview:["entrevista","recrutamento","processo seletivo","seleção profissional"],
 programming:["programação","desenvolvimento de software","desenvolvedor","software","codificação","sistemas"],
 study:["estudar","estudo","aprendizado","aprender","curso","aula"],
 english:["inglês","língua inglesa","idioma inglês"],
 meeting:["reunião","encontro profissional","compromisso","agenda"],
 contract:["contrato","assinatura","instrumento contratual"],
 budget:["orçamento","proposta comercial","cotação","preço"],
 health:["saúde","medicamento","remédio","tratamento"],
 family:["família","filho","filha","criança"],
 preference:["prefiro","preferência","gosto","favorito"],
 goal:["objetivo","meta","pretendo","quero conseguir"],
};
export const normalizeContext=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const stop=new Set("a o as os de da do das dos em no na nos nas para por pra com e ou um uma uns umas eu voce me meu minha meus minhas que qual quais como quando onde lembra lembro lembrava recordar recorda sabe sobre aquele aquela aqueles aquelas isso isto foi esta estou estava tenho tinha pode poderia ajuda ajudar antes dias depois area favor queria procurando buscando busca registrado registrada anotei anotou agora verdade mudou tem nao nunca sem".split(" "));
export function contextFeatures(text:string){
 const normalized=normalizeContext(text),words=[...new Set(normalized.split(" ").filter(w=>w.length>=3 && !stop.has(w)))].slice(0,12);
 const topicIds=Object.keys(concepts).filter(id=>concepts[id].some(term=>(` ${normalized} `).includes(` ${normalizeContext(term)} `)));
 const rawWords=(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w=>words.includes(normalizeContext(w)));
 const aliases=topicIds.flatMap(id=>concepts[id]);
 const terms=[...new Set([...rawWords,...words,...aliases,...aliases.map(normalizeContext)])].slice(0,48);
 return {words,topicIds,terms};
}
export function contextScore(query:string,text:string){
 const q=contextFeatures(query),t=contextFeatures(text);
 const words=q.words.filter(w=>t.words.includes(w) || (` ${normalizeContext(text)} `).includes(` ${w} `)).length;
 const shared=q.topicIds.filter(id=>t.topicIds.includes(id));
 return {score:words*3+shared.length*4,matchedConcepts:shared,match:shared.length?"concept":"word"};
}
