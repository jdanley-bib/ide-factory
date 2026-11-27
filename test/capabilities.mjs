import { findEntry } from '../src/lib/command-help.mjs';

/** The capabilities a scenario may depend on, each detected from the shipped command registry. */
export const CAPABILITY_PROBES = {
  'blocked-states': () => Boolean(findEntry(['run'])?.flags.some((flag) => flag.name === 'json')),
  'authorize': () => Boolean(findEntry(['authorize'])),
  'attempt-reopen': () => Boolean(findEntry(['attempt', 'reopen'])),
  'requirements': () => Boolean(findEntry(['requirements'])),
  'reconcile-plan': () => Boolean(findEntry(['sync-tasks'])?.flags.some((flag) => flag.name === 'plan')),
  'autonomy-report': () => Boolean(findEntry(['autonomy', 'report'])),
};

export function presentCapabilities(probes = CAPABILITY_PROBES) {
  return new Set(Object.keys(probes).filter((name) => probes[name]()));
}

/** A skip reason naming every missing capability, or false when none is missing. */
export function skipReason(required, present = presentCapabilities()) {
  const missing = required.filter((name) => !present.has(name));
  return missing.length === 0 ? false : `waiting for capability: ${missing.join(', ')}`;
}

/** Declared skip reasons whose capability is now present. A stale reason must fail the suite. */
export function staleSkipReasons(declared, present = presentCapabilities()) {
  return declared.filter(({ requires }) => requires.every((name) => present.has(name)))
    .map(({ name }) => name);
}
