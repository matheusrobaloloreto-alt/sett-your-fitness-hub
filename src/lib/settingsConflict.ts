export function isSettingsConflict(error:unknown):boolean {
 return !!error && typeof error==="object" && "code" in error && ["PT409","40001"].includes(String(error.code));
}
