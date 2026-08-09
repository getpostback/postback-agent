import { Command, InvalidArgumentError } from 'commander';

import { PostbackClient, type AgentEnvelope } from './client.js';
import {
  resolveConfiguredApiUrl,
  resolveToken,
} from './config.js';
import { writeJson, writePretty } from './output.js';

export type GlobalOptions = {
  human?: boolean;
  json?: boolean;
  pretty?: boolean;
};

export async function authenticatedClient(): Promise<PostbackClient> {
  return clientForToken(await requireToken());
}

export async function clientForToken(token: string): Promise<PostbackClient> {
  return new PostbackClient({ apiUrl: await resolveConfiguredApiUrl(), token });
}

export async function requireToken(): Promise<string> {
  const token = await resolveToken();
  if (!token) {
    throw new Error(
      'Not authenticated. Run `postback auth login` or set POSTBACK_TOKEN.',
    );
  }
  return token;
}

export function globalOptions(program: Command): GlobalOptions {
  return program.opts<GlobalOptions>();
}

export function emit(
  program: Command,
  value: AgentEnvelope | object,
  human?: () => string,
): void {
  const options = globalOptions(program);
  if (options.human && human) {
    process.stdout.write(`${human()}\n`);
    return;
  }
  if (options.pretty) {
    writePretty(value);
    return;
  }
  writeJson(value);
}

export function integer(min: number, max: number) {
  return (value: string): number => {
    if (!/^\d+$/.test(value)) {
      throw new InvalidArgumentError(`Expected an integer from ${min} to ${max}`);
    }
    const parsed = Number(value);
    if (parsed < min || parsed > max) {
      throw new InvalidArgumentError(`Expected an integer from ${min} to ${max}`);
    }
    return parsed;
  };
}

export function positiveNumber(max: number) {
  return (value: string): number => {
    const normalized = value.trim();
    const parsed = Number(normalized);
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      throw new InvalidArgumentError(
        'Expected a positive money amount with at most two decimal places',
      );
    }
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
      throw new InvalidArgumentError(
        `Expected a positive number no greater than ${max}`,
      );
    }
    return parsed;
  };
}

export function currency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new InvalidArgumentError('Expected a three-letter currency code');
  }
  return normalized;
}

export function providerId(value: string): string {
  const normalized = value.trim();
  if (!/^\d{1,20}$/.test(normalized)) {
    throw new InvalidArgumentError('Expected a numeric provider ID');
  }
  return normalized;
}

export function oneOf<const T extends readonly string[]>(values: T) {
  return (value: string): T[number] => {
    if (!values.includes(value as T[number])) {
      throw new InvalidArgumentError(`Expected one of: ${values.join(', ')}`);
    }
    return value as T[number];
  };
}
