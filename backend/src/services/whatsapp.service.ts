import {prisma} from '../config/prisma';
import {createWhatsAppSender} from './whatsapp.sender';
import type {ReminderControls} from '../domain/reminder.buttons';
export const sendWhatsAppMessage=(phone:string,message:string,kind:'reply'|'reminder'='reply',controls?:ReminderControls)=>createWhatsAppSender(prisma,process.env)(phone,message,kind,controls);
export const sendWhatsAppReminder=(phone:string,message:string,controls?:ReminderControls)=>sendWhatsAppMessage(phone,message,'reminder',controls);