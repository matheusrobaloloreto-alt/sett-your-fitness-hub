import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { api, fixture, login } from './self-service-api.mjs';
import { privateFile } from './self-service-local.mjs';

// Only real loopback HTTP, protected by the shared API helper. No SQL/schema/reset path.
test('real GoTrue/PostgREST XP and achievements: authority, tenants, history and privacy', { timeout: 120000 }, async t => {
  const state = fixture();
  const run = randomUUID().replaceAll('-', '');
  const ids = Object.fromEntries(['student', 'peer', 'foreign', 'workout', 'incomplete', 'peerWorkout', 'foreignWorkout', 'activity', 'foreignActivity', 'legacy', 'peerXp', 'foreignXp', 'disabledWorkout', 'disabledActivity'].map(name => [name, randomUUID()]));
  const sessions = {};
  const checks = [];
  const definitions = [];
  let originalExperience;
  let lastOwnedExperience;
  let passed = false;
  const now = new Date().toISOString();
  const legacyTime = new Date(Date.now() - 370 * 86400000).toISOString();
  const report = { run, auth: 'real-local-GoTrue', transport: 'real-local-PostgREST', schema: 'minimal-explicit-QA-dependencies', checks };

  async function request(label, endpoint, options, expected) {
    const result = await api(endpoint, options);
    checks.push({ label, status: result.status, code: result.data?.code ?? null });
    assert.equal(result.status, expected, `${label}: HTTP ${result.status}, code ${result.data?.code ?? 'none'}`);
    return result.data;
  }
  const rpc = (label, name, body, role = 'student', expected = 200) => request(label, `/rest/v1/rpc/${name}`, { method: 'POST', token: sessions[role], body }, expected);
  const read = (table, filter, role) => request(`read ${table}`, `/rest/v1/${table}?${filter}`, role ? { token: sessions[role] } : { admin: true }, 200);
  const insert = (table, rows) => request(`seed own ${table}`, `/rest/v1/${table}`, { method: 'POST', admin: true, body: rows }, 201);
  async function currentSettings() {
    const rows = await read('company_product_settings', `company_id=eq.${state.companyA}&select=settings,version`, 'adminA');
    return rows[0] ?? { settings: {}, version: 0 };
  }
  async function saveExperience(change) {
    const current = await currentSettings();
    const settings = { ...current.settings, experience: { ...(current.settings.experience ?? originalExperience), ...change } };
    const saved = await rpc('admin saves experience', 'save_company_product_settings', { _company_id: state.companyA, _settings: settings, _expected_version: current.version }, 'adminA');
    lastOwnedExperience = saved.settings.experience;
    const persisted = await currentSettings();
    assert.equal(persisted.version, saved.version);
    assert.deepEqual(persisted.settings.experience, lastOwnedExperience);
    return saved;
  }
  async function xpRows() {
    return read('xp_events', `student_id=eq.${ids.student}&select=*&order=id`);
  }
  const ownAward = (type, source, role = 'student', student = ids.student, expected = 200) => rpc(`award ${type}`, 'award_company_xp', { _student_id: student, _event_type: type, _source_id: source }, role, expected);

  t.after(async () => {
    const cleanupErrors = [];
    for (const row of definitions) {
      try {
        const current = await read('achievements', `id=eq.${row.id}&select=*`, 'adminA');
        if (!current[0]) continue;
        const value = current[0];
        const definition = Object.fromEntries(['code', 'title', 'description', 'criteria_type', 'criteria_value', 'xp_reward'].map(key => [key, value[key]]));
        await rpc('deactivate own synthetic achievement', 'save_company_achievement', { _company_id: state.companyA, _definition: { ...definition, is_active: false }, _achievement_id: value.id, _expected_updated_at: value.updated_at }, 'adminA');
      } catch { cleanupErrors.push('own achievement deactivation'); }
    }
    try {
      await request('deactivate own synthetic students', `/rest/v1/students?id=in.(${ids.student},${ids.peer},${ids.foreign})`, { method: 'PATCH', admin: true, body: { status: 'inactive' } }, 200);
    } catch { cleanupErrors.push('own student deactivation'); }
    if (lastOwnedExperience) {
      try {
        const current = await currentSettings();
        assert.deepEqual(current.settings.experience, lastOwnedExperience, 'Concurrent experience change: do not overwrite another worker');
        const saved = await rpc('restore original experience only', 'save_company_product_settings', { _company_id: state.companyA, _settings: { ...current.settings, experience: originalExperience }, _expected_version: current.version }, 'adminA');
        assert.deepEqual(saved.settings.experience, originalExperience);
        assert.deepEqual((await currentSettings()).settings.experience, originalExperience);
      } catch { cleanupErrors.push('experience restoration; no forced overwrite attempted'); }
    }
    report.passed = passed && cleanupErrors.length === 0;
    report.cleanupErrors = cleanupErrors;
    privateFile('xp-http-last-run.private.json', JSON.stringify(report, null, 2));
    assert.deepEqual(cleanupErrors, [], 'Local cleanup/restoration must succeed');
  });

  for (const role of ['adminA', 'adminB', 'student', 'trainer']) {
    const session = await login(state.people[role], { fresh: true });
    sessions[role] = session.access_token;
    const user = await request(`GoTrue validates ${role}`, '/auth/v1/user', { token: sessions[role] }, 200);
    assert.equal(user.id, state.people[role].id);
  }
  const existingHistory = await read('xp_events', 'student_id=eq.cccccccc-cccc-4ccc-8ccc-cccccccccccc&select=*&order=id');
  await insert('students', [
    { id: ids.student, company_id: state.companyA, user_id: state.people.student.id, full_name: 'Xphttp PrivateSurname', email: `xp-${run}@qa.invalid`, weekly_workout_goal: 1, status: 'active' },
    { id: ids.peer, company_id: state.companyA, user_id: null, full_name: 'Privacyprobe ConfidentialSurname', email: `peer-${run}@qa.invalid`, weekly_workout_goal: 3, status: 'active' },
    { id: ids.foreign, company_id: state.companyB, user_id: null, full_name: 'Foreignprobe ForeignSurname', email: `foreign-${run}@qa.invalid`, weekly_workout_goal: 3, status: 'active' },
  ]);
  const policy = await rpc('student reads own effective policy', 'get_student_experience_policy', { _student_id: ids.student, _company_id: state.companyA });
  originalExperience = policy;
  await insert('workout_sessions', [
    { id: ids.workout, student_id: ids.student, company_id: state.companyA, status: 'completed', session_date: now.slice(0, 10), completed_at: now, started_at: now },
    { id: ids.incomplete, student_id: ids.student, company_id: state.companyA, status: 'active', session_date: now.slice(0, 10), completed_at: null, started_at: now },
    { id: ids.peerWorkout, student_id: ids.peer, company_id: state.companyA, status: 'completed', session_date: now.slice(0, 10), completed_at: now, started_at: now },
    { id: ids.foreignWorkout, student_id: ids.foreign, company_id: state.companyB, status: 'completed', session_date: now.slice(0, 10), completed_at: now, started_at: now },
  ]);
  await insert('external_activities', [
    { id: ids.activity, student_id: ids.student, company_id: state.companyA },
    { id: ids.foreignActivity, student_id: ids.foreign, company_id: state.companyB },
  ]);
  const seeded = await insert('xp_events', [
    { student_id: ids.student, company_id: state.companyA, event_type: 'workout', xp_amount: 17, source_id: ids.legacy, notes: `synthetic legacy ${run}`, created_at: legacyTime },
    { student_id: ids.peer, company_id: state.companyA, event_type: 'workout', xp_amount: 5000, source_id: ids.peerXp, notes: `synthetic ranking fixture ${run}`, created_at: now },
    { student_id: ids.foreign, company_id: state.companyB, event_type: 'workout', xp_amount: 7000, source_id: ids.foreignXp, notes: `synthetic foreign ranking fixture ${run}`, created_at: now },
  ]);
  const legacy = seeded.find(row => row.source_id === ids.legacy);
  assert.equal(legacy.xp_amount, 17);

  const saved = await saveExperience({ xp_workout: 75, xp_external_activity: 45, gamification_enabled: true });
  const definition = { code: `qa_xp_${run}`, title: 'Synthetic HTTP workout milestone', description: 'Synthetic QA only', criteria_type: 'workouts_total', criteria_value: 1, xp_reward: 20, is_active: true };
  const deniedDefinition = await rpc('trainer cannot configure achievements', 'save_company_achievement', { _company_id: state.companyA, _definition: definition }, 'trainer', 403);
  assert.equal(deniedDefinition.code, '42501');
  const crossDefinition = await rpc('admin B cannot configure A achievements', 'save_company_achievement', { _company_id: state.companyA, _definition: definition }, 'adminB', 403);
  assert.equal(crossDefinition.code, '42501');
  let achievement = await rpc('admin professional configures achievement', 'save_company_achievement', { _company_id: state.companyA, _definition: definition }, 'adminA');
  definitions.push(achievement);
  assert.equal(achievement.company_id, state.companyA);
  assert.equal(achievement.xp_reward, 20);
  const firstTimestamp = achievement.updated_at;
  achievement = await rpc('admin updates own achievement', 'save_company_achievement', { _company_id: state.companyA, _definition: definition, _achievement_id: achievement.id, _expected_updated_at: firstTimestamp }, 'adminA');
  const conflict = await rpc('achievement stale CAS is HTTP409', 'save_company_achievement', { _company_id: state.companyA, _definition: definition, _achievement_id: achievement.id, _expected_updated_at: firstTimestamp }, 'adminA', 409);
  assert.equal(conflict.code, 'PT409');
  const history = await read('company_achievement_history', `achievement_id=eq.${achievement.id}&select=definition,changed_by`, 'adminA');
  assert.equal(history.length, 2);
  assert.ok(history.every(row => row.changed_by === state.people.adminA.id && row.definition.xp_reward === 20));

  for (const [role, student, source] of [['adminB', ids.student, ids.workout], ['student', ids.foreign, ids.foreignWorkout], ['student', ids.peer, ids.peerWorkout], ['student', ids.student, ids.foreignWorkout], ['student', ids.student, ids.incomplete]]) {
    const denied = await ownAward('workout', source, role, student, 403);
    assert.equal(denied.code, '42501');
  }
  const foreignSource = await ownAward('external_activity', ids.foreignActivity, 'student', ids.student, 403);
  assert.equal(foreignSource.code, '42501');
  const unearned = await rpc('student cannot forge achievement source', 'award_xp', { _student_id: ids.student, _event_type: 'achievement', _xp_amount: 999999, _source_id: achievement.id }, 'student', 403);
  assert.equal(unearned.code, '42501');
  const tampered = await rpc('typed XP RPC rejects extra client amount', 'award_company_xp', { _student_id: ids.student, _event_type: 'workout', _source_id: ids.workout, _xp_amount: 999999 }, 'student', 404);
  assert.equal(tampered.code, 'PGRST202');
  const direct = await request('student cannot insert XP amount directly', '/rest/v1/xp_events', { method: 'POST', token: sessions.student, body: { student_id: ids.student, company_id: state.companyA, event_type: 'workout', xp_amount: 999999, source_id: ids.workout } }, 403);
  assert.equal(direct.code, '42501');
  assert.equal((await xpRows()).length, 1, 'Denied attempts must not persist any XP');

  const workoutId = await ownAward('workout', ids.workout);
  assert.equal(typeof workoutId, 'string');
  const externalId = await rpc('legacy client amount cannot determine external XP', 'award_xp', { _student_id: ids.student, _event_type: 'external_activity', _xp_amount: 999999, _source_id: ids.activity });
  assert.equal(typeof externalId, 'string');
  let ledger = await xpRows();
  const workout = ledger.find(row => row.source_id === ids.workout);
  const external = ledger.find(row => row.source_id === ids.activity);
  assert.equal(workout.xp_amount, 75);
  assert.equal(external.xp_amount, 45);
  assert.equal(workout.policy_version, saved.version);
  assert.equal(external.policy_snapshot.xp_external_activity, 45);
  const unlocked = await rpc('student unlocks earned achievements', 'check_and_unlock_achievements', { _student_id: ids.student });
  assert.ok(unlocked >= 1);
  const earned = await read('student_achievements', `student_id=eq.${ids.student}&achievement_id=eq.${achievement.id}&select=*`);
  assert.equal(earned.length, 1);
  ledger = await xpRows();
  assert.equal(ledger.find(row => row.source_id === achievement.id)?.xp_amount, 20);
  const catalog = await rpc('student reads own achievement catalog', 'get_student_achievement_catalog', { _student_id: ids.student });
  assert.ok(catalog.some(row => row.id === achievement.id));
  const rank = await rpc('student reads own exact rank', 'get_student_rank', { _student_id: ids.student });
  assert.equal(Number(rank[0].xp), ledger.reduce((sum, row) => sum + row.xp_amount, 0));
  const board = await rpc('monthly leaderboard uses private projection', 'get_monthly_leaderboard', { _company_id: state.companyA });
  assert.equal(board.length, 1);
  assert.deepEqual(Object.keys(board[0]).sort(), ['caller', 'top3']);
  assert.ok(board[0].top3.length <= 3);
  assert.ok(board[0].top3.some(row => row.xp === 5000 && row.display_name === 'Privacyprobe C.'), 'A peer must be present with only a masked name');
  for (const row of board[0].top3) assert.deepEqual(Object.keys(row).sort(), ['display_name', 'rank', 'xp']);
  assert.deepEqual(Object.keys(board[0].caller).sort(), ['rank', 'total_participantes', 'xp']);
  const publicJson = JSON.stringify(board);
  for (const privateValue of ['ConfidentialSurname', 'PrivateSurname', 'ForeignSurname', ids.peer, ids.foreign, `peer-${run}@qa.invalid`]) assert.ok(!publicJson.includes(privateValue), 'Leaderboard must not expose identity/contact fields');
  assert.equal((await rpc('student cannot read foreign company leaderboard', 'get_monthly_leaderboard', { _company_id: state.companyB }, 'student', 403)).code, '42501');
  const foreignLedger = await read('xp_events', `student_id=eq.${ids.foreign}&select=*`, 'adminB');
  assert.equal(foreignLedger.length, 1, 'The foreign row must really exist and be readable by its own tenant');
  assert.equal(foreignLedger[0].xp_amount, 7000);
  assert.deepEqual(await read('xp_events', `student_id=eq.${ids.foreign}&select=*`, 'student'), []);

  await saveExperience({ xp_workout: 90, xp_external_activity: 60 });
  assert.equal(await ownAward('workout', ids.workout), null);
  assert.equal(await ownAward('external_activity', ids.activity), null);
  await rpc('achievement recheck cannot duplicate awards', 'check_and_unlock_achievements', { _student_id: ids.student });
  const replayed = await xpRows();
  assert.deepEqual(replayed, ledger, 'Policy changes and replay must not reprice or duplicate existing XP');
  assert.deepEqual(replayed.find(row => row.source_id === ids.legacy), legacy);

  const disabledDefinition = { ...definition, code: `qa_disabled_${run}`, title: 'Synthetic disabled milestone' };
  definitions.push(await rpc('admin defines a new unearned milestone', 'save_company_achievement', { _company_id: state.companyA, _definition: disabledDefinition }, 'adminA'));
  await saveExperience({ gamification_enabled: false });
  await insert('workout_sessions', [{ id: ids.disabledWorkout, student_id: ids.student, company_id: state.companyA, status: 'completed', session_date: now.slice(0, 10), completed_at: now, started_at: now }]);
  await insert('external_activities', [{ id: ids.disabledActivity, student_id: ids.student, company_id: state.companyA }]);
  assert.equal(await ownAward('workout', ids.disabledWorkout), null);
  assert.equal(await ownAward('external_activity', ids.disabledActivity), null);
  assert.equal(await rpc('disabled gamification prevents new conquests', 'check_and_unlock_achievements', { _student_id: ids.student }), 0);
  assert.deepEqual(await xpRows(), ledger);
  assert.deepEqual(await read('student_achievements', `student_id=eq.${ids.student}&achievement_id=eq.${definitions[1].id}&select=*`), []);
  assert.deepEqual(await rpc('disabled gamification hides rank', 'get_student_rank', { _student_id: ids.student }), []);
  const disabledBoard = await rpc('disabled gamification hides monthly ranking', 'get_monthly_leaderboard', { _company_id: state.companyA });
  assert.deepEqual(disabledBoard[0], { top3: [], caller: { rank: null, xp: 0, total_participantes: 0 } });
  assert.deepEqual(await read('xp_events', 'student_id=eq.cccccccc-cccc-4ccc-8ccc-cccccccccccc&select=*&order=id'), existingHistory, 'Existing shared QA history must remain untouched');
  report.readback = { workoutXp: 75, externalXp: 45, achievementXp: 20, legacyXp: 17, replayUnchanged: true, disabledNewAwards: 0, rankingPrivate: true };
  passed = true;
  t.diagnostic('Verified real HTTP status + persisted readback: workout75/external45/achievement20/legacy17; tampering denied or ignored safely; replay/disable/privacy preserved.');
});
