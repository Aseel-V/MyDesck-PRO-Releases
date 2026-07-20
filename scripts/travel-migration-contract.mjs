export const travelMigrationOrder = [
  '20260719090000',
  '20260719130000',
  '20260719140000',
  '20260719150000',
  '20260719160000',
  '20260719170000',
  '20260719180000',
];

export const travelMigrationDependencies = new Map([
  ['20260719160000', ['20260719090000', '20260719140000']],
  ['20260719170000', ['20260719140000', '20260719160000']],
  ['20260719180000', ['20260719140000']],
]);

export function assertTravelMigrationHistory(appliedVersions) {
  const applied = new Set(appliedVersions);
  for (const [migration, prerequisites] of travelMigrationDependencies) {
    if (!applied.has(migration)) continue;
    const missing = prerequisites.filter((version) => !applied.has(version));
    if (missing.length > 0) {
      throw new Error(`Migration ${migration} is recorded without prerequisite migration(s): ${missing.join(', ')}`);
    }
  }
}
