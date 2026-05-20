const { z } = require("zod");

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});

const loginSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128)
});

const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().default("")
});

const memberSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  role: z.enum(["Admin", "Member"]).default("Member")
});

const taskSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1500).optional().default(""),
  assigneeId: z.string().uuid().nullable().optional(),
  status: z.enum(["Todo", "In Progress", "Done"]).default("Todo"),
  priority: z.enum(["Low", "Medium", "High"]).default("Medium"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});

const taskUpdateSchema = taskSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one task field is required"
});

function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: parsed.error.errors.map((error) => ({
          field: error.path.join("."),
          message: error.message
        }))
      });
    }
    req.body = parsed.data;
    return next();
  };
}

module.exports = {
  signupSchema,
  loginSchema,
  projectSchema,
  memberSchema,
  taskSchema,
  taskUpdateSchema,
  validate
};
