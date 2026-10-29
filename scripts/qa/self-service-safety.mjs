export const LOCAL_PROJECT = 'sett-self-service-local-20261026';
export const LOCAL_URL = 'http://127.0.0.1:57421';
export function assertLocalUrl(value) {
  const url = new URL(value);
  if (url.origin !== LOCAL_URL || url.username || url.password) {
    throw new Error('Only the isolated QA endpoint is allowed');
  }
  return value;
}
export function assertProject(project, linked) {
  if (linked) throw new Error('Linked projects are forbidden for QA');
  if (project !== LOCAL_PROJECT) throw new Error('Only the isolated QA project is allowed');
  return project;
}
