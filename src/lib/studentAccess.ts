export function canAccessStudentWorkout({
  role,
  userId,
  companyId,
  studentUserId,
  studentCompanyId,
  studentStatus,
}: {
  role: string;
  userId: string;
  companyId?: string | null;
  studentUserId?: string | null;
  studentCompanyId?: string | null;
  studentStatus?: string | null;
}) {
  if (role === "master") return true;
  if (role === "student") return studentStatus !== "inactive" && studentUserId === userId;
  return ["admin", "coordinator", "trainer"].includes(role)
    && Boolean(companyId)
    && studentCompanyId === companyId;
}
