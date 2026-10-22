import {Router} from "express";
import type {PrismaClient} from "@prisma/client";
import {createAdminGuard} from "./admin.guard";
import {exportCalendar} from "../domain/calendar.export";
import {parseTimestamp} from "../domain/reminder.validation";
export function createCalendarRouter(store:Pick<PrismaClient,"appointment">,config:{adminToken():string|undefined;phoneNumberId():string|undefined}){
 const router=Router();router.use(createAdminGuard(config.adminToken));
 router.get("/export.ics",async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const account=config.phoneNumberId();if(!account)return res.sendStatus(503);
  if(typeof req.query.phone!=="string" || !/^\d{10,15}$/.test(req.query.phone) || typeof req.query.start!=="string" || typeof req.query.end!=="string")return res.status(400).json({error:"Informe contato e início/fim com fuso, em período de até 93 dias."});
  let start:Date,end:Date;
  try{start=parseTimestamp(req.query.start);end=parseTimestamp(req.query.end);if(end<=start || end.getTime()-start.getTime()>93*86400000)throw Error();}catch{return res.status(400).json({error:"Informe início/fim válidos com fuso, em período de até 93 dias."});}
  try{
   const ics=await exportCalendar(store,req.query.phone,account,start,end);
   return res.set({"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":"attachment; filename=secretaria.ics"}).send(ics);
  }catch{return res.status(503).json({error:"Não foi possível exportar. Tente um período menor ou consulte a operação."});}
 });
 return router;
}
