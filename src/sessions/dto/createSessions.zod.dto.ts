import { z } from 'zod';

export const CreateSessionsSchema = z
  .object({
    userId: z.string(),
    startTime: z.date(),
    duration: z.number().positive(), // in minutes
    endTime: z.date().optional(),
  })
  .required();

export type CreateSessionZodDto = z.infer<typeof CreateSessionsSchema>;
