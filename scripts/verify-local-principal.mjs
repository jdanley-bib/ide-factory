#!/usr/bin/env node
/**
 * Temporary local principal verifier for this repository.
 * Confirms only provider `local` and subject `jason-danley`.
 * Prints issuer `ide-factory-local`. Any other claim exits non-zero
 * and writes no subject to stdout.
 */
const ALLOWED_PROVIDER = 'local';
const ALLOWED_SUBJECT = 'jason-danley';
const ISSUER = 'ide-factory-local';

const provider = process.env.FACTORY_PRINCIPAL_PROVIDER;
const subject = process.env.FACTORY_PRINCIPAL_SUBJECT;

if (provider !== ALLOWED_PROVIDER || subject !== ALLOWED_SUBJECT) {
  process.exit(1);
}

process.stdout.write(JSON.stringify({
  provider: ALLOWED_PROVIDER,
  subject: ALLOWED_SUBJECT,
  issuer: ISSUER,
}));
