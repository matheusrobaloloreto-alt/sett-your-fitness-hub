// Mirror get_company_student_staff_directory's membership/profile/role join.
// Used only by QA: the production RPC and Portfolio remain unchanged.
type Profile = { user_id: string; full_name?: string | null };
type Member = { company_id: string; user_id: string };
type Role = { user_id: string; role: string };
export function visualStaffDirectory(companyId: unknown, profiles: Profile[], memberships: Member[], userRoles: Role[]) {
  const staffRoles = new Set(["trainer", "coordinator", "admin", "master"]);
  const memberIds = new Set(memberships.filter(member => member.company_id === companyId).map(member => member.user_id));
  return [...memberIds].flatMap(userId => {
    const roles = [...new Set(userRoles.filter(role => role.user_id === userId && staffRoles.has(role.role)).map(role => role.role))].sort();
    if (!roles.length) return [];
    return [{ user_id: userId, full_name: profiles.find(profile => profile.user_id === userId)?.full_name ?? "Sem nome", roles }];
  }).sort((a, b) => a.full_name.localeCompare(b.full_name) || a.user_id.localeCompare(b.user_id));
}
