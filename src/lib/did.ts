/**
 * DID helpers – resolve and create Decentralised Identifiers.
 * Wire up with Midnight's DID SDK or a W3C-compliant resolver.
 */

export type Did = `did:${string}`;

export function isValidDid(value: string): value is Did {
  return value.startsWith("did:");
}

export async function resolveDid(_did: Did): Promise<Record<string, unknown>> {
  // TODO: implement DID resolution
  return {};
}
