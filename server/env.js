/**
 * Environment variables, under either name, during the rename.
 *
 * The product is Contesora now, but its settings are called STORYTIME_* on
 * every machine that runs it -- in the deploy host's .env, in .env.test, in
 * whatever the operator has exported in a shell. Renaming them in the code
 * alone would take the database URL with it and the app would come up unable
 * to connect, at the moment somebody was least expecting a rename to be able
 * to do that.
 *
 * So both names work. CONTESORA_* is preferred and STORYTIME_* still answers,
 * which lets the hosts be migrated one at a time and in their own order rather
 * than in the same breath as a deploy. When nothing sets the old names any
 * more, this module and the `legacyNamesInUse` report go with them.
 */

/** Reads NAME under the new prefix first, then the old one, then any aliases. */
export function env(name, ...aliases) {
  const candidates = [`CONTESORA_${name}`, `STORYTIME_${name}`, ...aliases];
  for (const key of candidates) {
    const value = process.env[key];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/** True when the variable is set under either prefix. */
export const envSet = (name, ...aliases) => env(name, ...aliases) !== undefined;

/**
 * Which old names are still in play. Worth saying out loud once at boot: a
 * rename that nobody finishes is a second name to maintain forever, and the
 * only way anyone will know it is safe to delete this file is if the app says
 * when it is still being used.
 */
export function legacyNamesInUse() {
  return Object.keys(process.env)
    .filter((key) => key.startsWith('STORYTIME_'))
    .filter((key) => process.env[key] !== undefined && process.env[key] !== '')
    .sort();
}
