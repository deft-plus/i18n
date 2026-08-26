// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

/**
 * Discovers shared Deft+ configuration files and generates synchronized i18n resources.
 *
 * The synchronization workflow loads the configured i18n plugin, downloads a complete resource
 * snapshot, validates every message with the runtime parser, and replaces the generated directory
 * only after every new file has been written successfully.
 *
 * @module
 */

import { dirname, isAbsolute, join, relative, resolve, toFileUrl } from '@std/path';

import { getI18nPlugin, type I18nPlugin } from './config.ts';
import { parseText } from './parser.ts';
import type { Resource } from './runtime_api.ts';

/**
 * Supported shared configuration filenames in discovery order.
 *
 * @internal
 */
export const CONFIG_FILENAMES = [
  'deft.config.ts',
  'deft.config.mts',
  'deft.config.cts',
  'deft.config.js',
  'deft.config.mjs',
  'deft.config.cjs',
] as const;

/**
 * Default directory for generated i18n artifacts.
 *
 * @internal
 */
const DEFAULT_OUTPUT = '.translations';

/**
 * Built-in parameter type names.
 *
 * @internal
 */
const BUILT_IN_TYPES = new Set(['string', 'number', 'boolean', 'Date', 'unknown']);

/** A complete resource snapshot returned by the Explorer synchronization endpoint. */
export interface SyncPayload {
  /** Locale names mapped to their translation resources. */
  resources: Record<string, Resource>;
}

/** Options controlling one CLI synchronization. */
export interface SynchronizeOptions {
  /** Directory from which configuration discovery starts. */
  cwd: string;
  /** Explicit configuration file, resolved from `cwd` when relative. */
  configPath?: string;
  /** Fetch implementation used to request the Explorer snapshot. */
  fetch?: typeof fetch;
}

/** Result reported after a successful synchronization. */
export interface SynchronizeResult {
  /** Absolute shared configuration path. */
  configPath: string;
  /** Absolute generated output directory. */
  outputPath: string;
  /** Locale names written to the resource directory. */
  locales: readonly string[];
}

/** An invalid CLI configuration, response, resource, or generated output. */
export class I18nCliError extends Error {
  /**
   * Creates an i18n CLI error.
   *
   * @param message - Description of the failed CLI operation.
   */
  constructor(message: string) {
    super(message);
    this.name = 'I18nCliError';
  }
}

/**
 * Finds a supported shared Deft+ configuration.
 *
 * @param cwd - Directory from which upward discovery starts.
 * @param explicitPath - Optional path that bypasses filename discovery.
 * @returns The absolute configuration path.
 *
 * @internal
 */
export async function findConfigPath(cwd: string, explicitPath?: string): Promise<string> {
  if (explicitPath) {
    const configPath = isAbsolute(explicitPath) ? explicitPath : resolve(cwd, explicitPath);
    await assertFile(configPath);
    return configPath;
  }

  let directory = resolve(cwd);

  while (true) {
    for (const filename of CONFIG_FILENAMES) {
      const configPath = join(directory, filename);

      if (await isFile(configPath)) {
        return configPath;
      }
    }

    const parent = dirname(directory);

    if (parent === directory) {
      break;
    }

    directory = parent;
  }

  throw new I18nCliError(
    `Could not find a Deft+ configuration (${CONFIG_FILENAMES.join(', ')}).`,
  );
}

/**
 * Downloads, validates, and atomically generates all locale resources.
 *
 * @param options - Configuration discovery and network dependencies.
 * @returns Generated output information.
 *
 * @internal
 */
export async function synchronize(options: SynchronizeOptions): Promise<SynchronizeResult> {
  const configPath = await findConfigPath(options.cwd, options.configPath);
  const plugin = await importProjectConfig(configPath);
  const response = await (options.fetch ?? fetch)(plugin.options.sync.endpoint);

  if (!response.ok) {
    throw new I18nCliError(
      `Could not synchronize translations: ${response.status} ${response.statusText}.`,
    );
  }

  const payload = validatePayload(await response.json(), plugin);
  const locales = Object.keys(payload.resources).sort();
  const configDirectory = dirname(configPath);
  const outputPath = resolve(configDirectory, plugin.options.output ?? DEFAULT_OUTPUT);
  await generateOutput(outputPath, configPath, plugin, payload.resources, locales);

  return { configPath, outputPath, locales };
}

/**
 * Imports and validates the default shared project configuration.
 *
 * @param configPath - Absolute configuration file path.
 * @returns Imported shared project configuration.
 *
 * @internal
 */
async function importProjectConfig(
  configPath: string,
): Promise<I18nPlugin> {
  const module = await import(`${toFileUrl(configPath).href}?i18n=${crypto.randomUUID()}`);
  const config: unknown = module.default;
  return getI18nPlugin(config);
}

/**
 * Validates the Explorer snapshot and all translation message contracts.
 *
 * @param value - Parsed synchronization response body.
 * @param plugin - Configured i18n plugin.
 * @returns Validated synchronization payload.
 *
 * @internal
 */
function validatePayload(value: unknown, plugin: I18nPlugin): SyncPayload {
  if (!isRecord(value) || !isRecord(value.resources)) {
    throw new I18nCliError('The synchronization response must contain a resources object.');
  }

  const resources: Record<string, Resource> = {};

  for (const [locale, resource] of Object.entries(value.resources)) {
    if (!/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(locale)) {
      throw new I18nCliError(`Locale "${locale}" cannot be used as a resource filename.`);
    }

    resources[locale] = validateResource(resource, locale, plugin);
  }

  if (!Object.hasOwn(resources, plugin.options.defaultLocale)) {
    throw new I18nCliError(
      `The default locale "${plugin.options.defaultLocale}" is missing from the response.`,
    );
  }

  for (const [locale, fallbacks] of Object.entries(plugin.options.fallbacks ?? {})) {
    if (locale !== 'default' && !Object.hasOwn(resources, locale)) {
      throw new I18nCliError(`Fallback configuration references unknown locale "${locale}".`);
    }

    for (const fallback of fallbacks ?? []) {
      if (!Object.hasOwn(resources, fallback)) {
        throw new I18nCliError(`Fallback configuration references unknown locale "${fallback}".`);
      }
    }
  }

  return { resources };
}

/**
 * Validates one locale resource and every contained message.
 *
 * @param value - Potential locale resource.
 * @param locale - Locale owning the resource.
 * @param plugin - Configured i18n plugin.
 * @returns Validated locale resource.
 *
 * @internal
 */
function validateResource(value: unknown, locale: string, plugin: I18nPlugin): Resource {
  if (!isRecord(value)) {
    throw new I18nCliError(`Resource for locale "${locale}" must be an object.`);
  }

  const resource: Resource = {};

  for (const [namespace, messages] of Object.entries(value)) {
    if (!isRecord(messages)) {
      throw new I18nCliError(`Namespace "${namespace}" in locale "${locale}" must be an object.`);
    }

    resource[namespace] = {};

    for (const [key, message] of Object.entries(messages)) {
      if (typeof message !== 'string') {
        throw new I18nCliError(
          `Translation "${namespace}.${key}" in locale "${locale}" must be a string.`,
        );
      }

      validateMessage(message, namespace, key, locale, plugin);
      resource[namespace][key] = message;
    }
  }

  return resource;
}

/**
 * Validates parser syntax and configured parameter transforms.
 *
 * @param message - Canonical translation message.
 * @param namespace - Namespace containing the message.
 * @param key - Translation key containing the message.
 * @param locale - Locale containing the message.
 * @param plugin - Configured i18n plugin.
 *
 * @internal
 */
function validateMessage(
  message: string,
  namespace: string,
  key: string,
  locale: string,
  plugin: I18nPlugin,
): void {
  let parts: ReturnType<typeof parseText>;

  try {
    parts = parseText(message);
  } catch (error) {
    throw new I18nCliError(
      `Translation "${namespace}.${key}" in locale "${locale}" is invalid: ${String(error)}`,
    );
  }

  for (const part of parts) {
    if (part.kind !== 'parameter') {
      continue;
    }

    if (!BUILT_IN_TYPES.has(part.type) && !Object.hasOwn(plugin.options.types ?? {}, part.type)) {
      throw new I18nCliError(
        `Translation "${namespace}.${key}" references un-configured type "${part.type}".`,
      );
    }

    for (const transform of part.transforms) {
      if (
        transform.kind === 'formatter' &&
        !Object.hasOwn(plugin.options.formatters ?? {}, transform.name)
      ) {
        throw new I18nCliError(
          `Translation "${namespace}.${key}" references un-configured formatter "${transform.name}".`,
        );
      }
    }
  }
}

/**
 * Writes a complete generated directory and replaces the prior output atomically.
 *
 * @param outputPath - Final generated directory.
 * @param configPath - Shared project configuration path.
 * @param plugin - Configured i18n plugin.
 * @param resources - Validated locale resources.
 * @param locales - Sorted locale names.
 *
 * @internal
 */
async function generateOutput(
  outputPath: string,
  configPath: string,
  plugin: I18nPlugin,
  resources: Record<string, Resource>,
  locales: readonly string[],
): Promise<void> {
  const parent = dirname(outputPath);
  await Deno.mkdir(parent, { recursive: true });
  const temporaryPath = await Deno.makeTempDir({ dir: parent, prefix: '.i18n-' });
  const resourcePath = join(temporaryPath, 'resources');
  await Deno.mkdir(resourcePath);

  try {
    for (const locale of locales) {
      await Deno.writeTextFile(
        join(resourcePath, `${locale}.json`),
        `${JSON.stringify(sortRecord(resources[locale]), null, 2)}\n`,
      );
    }

    const configImport = toImportPath(temporaryPath, configPath);
    await Deno.writeTextFile(
      join(temporaryPath, 'resources.generated.ts'),
      renderResources(configImport, resources[plugin.options.defaultLocale], locales, plugin),
    );
    await Deno.writeTextFile(
      join(temporaryPath, 'runtime.generated.ts'),
      renderRuntime(configImport),
    );
    await Deno.writeTextFile(
      join(temporaryPath, 'manifest.json'),
      `${
        JSON.stringify(
          { version: 1, defaultLocale: plugin.options.defaultLocale, locales },
          null,
          2,
        )
      }\n`,
    );

    await replaceDirectory(temporaryPath, outputPath);
  } catch (error) {
    await Deno.remove(temporaryPath, { recursive: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Renders the locale registry and generated translation declarations.
 *
 * @param configImport - Relative import path to the shared configuration.
 * @param canonical - Default locale resource used for declarations.
 * @param locales - Sorted locale names.
 * @param plugin - Configured i18n plugin.
 * @returns Formatted generated TypeScript source.
 *
 * @internal
 */
function renderResources(
  configImport: string,
  canonical: Resource,
  locales: readonly string[],
  plugin: I18nPlugin,
): string {
  const imports = locales.map((locale, index) =>
    `import resource${index} from ${
      typescriptString(`./resources/${locale}.json`)
    } with { type: 'json' };`
  ).join('\n');
  const entries = locales.map((locale, index) => `  ${typescriptString(locale)}: resource${index},`)
    .join('\n');
  const namespaces = Object.entries(canonical).sort(([left], [right]) => left.localeCompare(right))
    .map(([namespace, messages]) => {
      const keys = Object.entries(messages).map(([key, message]) =>
        `      ${typescriptString(key)}: ${typescriptString(message)};`
      ).join('\n');
      return `    ${typescriptString(namespace)}: {\n${keys}\n    };`;
    }).join('\n');
  const customTypes = Object.keys(plugin.options.types ?? {}).filter((name) =>
    !BUILT_IN_TYPES.has(name)
  ).sort().map((name) =>
    `    ${typescriptString(name)}: ConfiguredTypes[${typescriptString(name)}];`
  )
    .join('\n');
  const typeBlock = customTypes ? `\n  interface CustomTypes {\n${customTypes}\n  }\n` : '';

  return `// This file is generated by @deft-plus/i18n. Do not edit.\n\n` +
    `import type projectConfig from ${typescriptString(configImport)};\n` +
    `import type { InferConfiguredI18nTypes } from '@deft-plus/i18n/config';\n` +
    `${imports}\n\n` +
    `type ConfiguredTypes = InferConfiguredI18nTypes<typeof projectConfig>;\n\n` +
    `declare module '@deft-plus/i18n' {\n` +
    `  interface Translation {\n${namespaces}\n  }\n${typeBlock}}\n\n` +
    `export const resources = {\n${entries}\n} as const;\n`;
}

/**
 * Renders the generated SSR-safe runtime factory.
 *
 * @param configImport - Relative import path to the shared configuration.
 * @returns Formatted generated TypeScript source.
 *
 * @internal
 */
function renderRuntime(configImport: string): string {
  return `// This file is generated by @deft-plus/i18n. Do not edit.\n\n` +
    `import { createI18n as createRuntime } from '@deft-plus/i18n';\n` +
    `import { getI18nPlugin } from '@deft-plus/i18n/config';\n` +
    `import projectConfig from ${typescriptString(configImport)};\n` +
    `import { resources } from './resources.generated.ts';\n\n` +
    `const plugin = getI18nPlugin(projectConfig);\n\n` +
    `export function createI18n() {\n` +
    `  const { output: _output, ...options } = plugin.options;\n` +
    `  return createRuntime({ ...options, resources });\n` +
    `}\n`;
}

/**
 * Replaces a generated directory while retaining a recoverable backup until completion.
 *
 * @param temporaryPath - Complete new generated directory.
 * @param outputPath - Final generated directory path.
 *
 * @internal
 */
async function replaceDirectory(temporaryPath: string, outputPath: string): Promise<void> {
  const backupPath = `${outputPath}.backup-${crypto.randomUUID()}`;
  const hadOutput = await pathExists(outputPath);

  if (hadOutput) {
    await Deno.rename(outputPath, backupPath);
  }

  try {
    await Deno.rename(temporaryPath, outputPath);
  } catch (error) {
    if (hadOutput) {
      await Deno.rename(backupPath, outputPath);
    }
    throw error;
  }

  if (hadOutput) {
    await Deno.remove(backupPath, { recursive: true });
  }
}

/**
 * Produces a portable relative module specifier.
 *
 * @param from - Directory containing the generated module.
 * @param target - File imported by the generated module.
 * @returns Relative module specifier using forward slashes.
 *
 * @internal
 */
function toImportPath(from: string, target: string): string {
  return relative(from, target).replaceAll('\\', '/');
}

/**
 * Escapes text as a single-quoted TypeScript string literal.
 *
 * @param value - Text to encode.
 * @returns TypeScript string literal.
 *
 * @internal
 */
function typescriptString(value: string): string {
  return `'${
    value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\r', '\\r').replaceAll(
      '\n',
      '\\n',
    )
  }'`;
}

/**
 * Recursively sorts object keys for deterministic generated JSON.
 *
 * @param value - JSON-compatible value to sort.
 * @returns Value with every object record sorted by key.
 *
 * @internal
 */
function sortRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(
      ([key, child]) => [key, isRecord(child) ? sortRecord(child) : child],
    ),
  );
}

/**
 * Asserts that an explicit configuration path points to a file.
 *
 * @param path - File path to inspect.
 *
 * @internal
 */
async function assertFile(path: string): Promise<void> {
  if (!await isFile(path)) {
    throw new I18nCliError(`Configuration file "${path}" does not exist.`);
  }
}

/**
 * Reports whether a path points to a regular file.
 *
 * @param path - Path to inspect.
 * @returns Whether the path is a file.
 *
 * @internal
 */
async function isFile(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound || error instanceof Deno.errors.NotCapable) {
      return false;
    }
    throw error;
  }
}

/**
 * Reports whether a filesystem path exists.
 *
 * @param path - Path to inspect.
 * @returns Whether the path exists.
 *
 * @internal
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

/**
 * Reports whether a value is a non-null object record.
 *
 * @param value - Value to inspect.
 * @returns Whether the value is an object record.
 *
 * @internal
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
