const test = require("node:test");
const assert = require("node:assert/strict");
const { signupSchema, taskSchema, taskUpdateSchema } = require("../src/validation");

test("signup normalizes email and requires strong enough password", () => {
  const parsed = signupSchema.parse({
    name: "Ada Lovelace",
    email: "ADA@EXAMPLE.COM",
    password: "password123"
  });

  assert.equal(parsed.email, "ada@example.com");
  assert.throws(() =>
    signupSchema.parse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "short"
    })
  );
});

test("task creation applies defaults", () => {
  const parsed = taskSchema.parse({
    title: "Draft project brief"
  });

  assert.equal(parsed.status, "Todo");
  assert.equal(parsed.priority, "Medium");
  assert.equal(parsed.description, "");
});

test("task patch does not apply creation defaults", () => {
  const parsed = taskUpdateSchema.parse({
    status: "Done"
  });

  assert.deepEqual(parsed, { status: "Done" });
});

test("empty task patch is rejected", () => {
  assert.throws(() => taskUpdateSchema.parse({}));
});
