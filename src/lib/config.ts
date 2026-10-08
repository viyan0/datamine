export function appUrl() {
  return (
    process.env.BETTER_AUTH_URL || (process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3000')
  );
}
export function requiredSecret(name: string) {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} must have at least 32 characters`);
  return value;
}
