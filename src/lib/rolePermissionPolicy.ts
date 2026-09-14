export function canRoleUseModule(role: string, module: string): boolean {
  return !(role === "trainer" && module === "financial");
}
