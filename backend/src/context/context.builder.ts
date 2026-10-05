import { prisma } from "../config/prisma";

export async function buildContext(
  phone: string,
  currentMessage: string
) {
  const user = await prisma.user.findUnique({
    where: {
      phone,
    },
  });

  return {
    now: new Date().toISOString(),

    user,

    currentMessage,

    memories: [],

    habits: [],

    lastMessages: [],
  };
}