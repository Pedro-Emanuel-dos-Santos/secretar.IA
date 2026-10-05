import { prisma } from "../config/prisma";

export async function createEvent(
  userId: string,
  type: string,
  source: string,
  payload: any
) {
  return prisma.event.create({
    data: {
      userId,
      type,
      source,
      payload,
    },
  });
}