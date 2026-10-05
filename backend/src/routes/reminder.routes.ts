import { Router } from "express";
import { createReminderController } from "../controllers/reminder.controller";

export const reminderRoutes = Router();

reminderRoutes.post("/", createReminderController);