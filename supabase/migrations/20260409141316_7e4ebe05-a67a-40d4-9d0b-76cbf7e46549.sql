
DELETE FROM enrollments WHERE id IN (
  '94632e22-03db-4686-aaed-822041a8987d',
  '6930d5a2-cc90-47a7-860e-3f49dfa2281a',
  '5a945790-77aa-46da-b260-38b07e56ab67',
  '9286fed0-8ddc-45d8-9087-fc5f4f0133c0',
  '8174407b-f836-46fc-867d-dd0bcbb127ea',
  '58b64291-76d6-41e6-acc4-88699ff00706',
  '113068b9-508a-411d-a6b6-f1a3afd9e464'
);

UPDATE enrollments SET status = 'active' WHERE id IN (
  'fa1295a0-dae7-4067-891a-3537ff4dcff9',
  '8882d9d2-6329-459c-8a96-8be7629a41f1',
  'c5a00f4b-0c75-4071-8e52-8b4b8e3a6ad3',
  'b27d15e0-e9e9-4793-9245-a3373fa8c676',
  '6eba16b2-8b70-4a11-b181-c2ec23df50d1',
  '17ce6afb-d1ff-41c7-8423-ea00f19a2bd3',
  '10dc3e49-f638-4b92-8b43-834aab0cae04'
);
