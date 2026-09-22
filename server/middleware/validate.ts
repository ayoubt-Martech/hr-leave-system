import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

/**
 * Zod validation middleware factory.
 * Usage: router.post('/path', validate(MySchema), handler)
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }
    req.body = result.data; // use the parsed/coerced data downstream
    next();
  };
}
