import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
describe('staff feedback route integration',()=>{
  it('mounts the real feedback response card once in student analytics',()=>{
    const source=readFileSync('src/pages/admin/StudentDetail.tsx','utf8');
    expect(source).toContain('import { StudentWorkoutFeedbackCard }');
    expect(source.match(/<StudentWorkoutFeedbackCard\b/g)).toHaveLength(1);
    expect(source).toMatch(/<TabsContent value="analytics"[\s\S]*?<StudentWorkoutFeedbackCard studentId=\{student.id\}/);
  });
});
