// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

/**
 * Defines the i18n plugin used inside a shared Deft+ project configuration.
 *
 * A project exports one plain configuration object whose `plugins` array may contain the i18n
 * plugin alongside future Deft+ plugins. The CLI reads the plugin to download resources and the
 * generated runtime reuses the same options, so locales, synchronization, formatters, validators,
 * and fallbacks have a single source of truth.
 *
 * @example Configure the i18n plugin
 * ```ts
 * import { i18n } from '@deft-plus/i18n/config';
 *
 * export default {
 *   plugins: [
 *     i18n({
 *       defaultLocale: 'en',
 *       output: './.translations',
 *       sync: {
 *         endpoint: 'https://example.com/api/i18n',
 *         interval: 60_000,
 *       },
 *     }),
 *   ],
 * };
 * ```
 *
 * @module
 */

import type {
  Fallbacks,
  FormatterRegistry,
  SyncOptions,
  TypeValidator,
  ValidationMode,
} from './runtime_api.ts';

/** Stable name used to identify the i18n plugin in a shared configuration. */
export const I18N_PLUGIN_NAME = '@deft-plus/i18n';

/** Runtime validators declared by name in the project configuration. */
export type ProjectTypeValidatorRegistry = Record<string, TypeValidator<unknown>>;

/** A plugin stored in the shared Deft+ project configuration. */
export interface DeftPlugin<Name extends string = string, Options = unknown> {
  /** Stable plugin identifier. */
  readonly name: Name;
  /** Plugin-owned configuration. */
  readonly options: Options;
}

/** The shared project configuration consumed by Deft+ tooling. */
export interface DeftConfig {
  /** Plugins enabled for the project. */
  readonly plugins: readonly DeftPlugin[];
  /** Additional configuration owned by other Deft+ tools. */
  readonly [key: string]: unknown;
}

/** Configuration shared by the i18n CLI and generated runtime. */
export interface I18nProjectConfig<
  Formatters extends FormatterRegistry = FormatterRegistry,
  Types extends ProjectTypeValidatorRegistry = ProjectTypeValidatorRegistry,
> {
  /** Canonical locale used for generated translation declarations. */
  defaultLocale: string;
  /** Directory receiving downloaded resources and generated runtime files. */
  output?: string;
  /** Endpoint and interval shared by CLI and runtime synchronization. */
  sync: SyncOptions;
  /** Custom value formatters referenced by translation messages. */
  formatters?: Formatters;
  /** Runtime validators for custom parameter types. */
  types?: Types;
  /** Locale-specific and default fallback chains. */
  fallbacks?: Fallbacks<string>;
  /** Runtime mistake handling. Defaults to `throw`. */
  validation?: ValidationMode;
}

/** A typed i18n plugin descriptor stored in a shared Deft+ configuration. */
export type I18nPlugin<Config extends I18nProjectConfig = I18nProjectConfig> = DeftPlugin<
  typeof I18N_PLUGIN_NAME,
  Config
>;

/** Infers custom parameter values from configured runtime type predicates. */
export type InferI18nTypes<Plugin extends I18nPlugin> = Plugin['options']['types'] extends
  ProjectTypeValidatorRegistry ? {
    [Name in keyof Plugin['options']['types']]: Plugin['options']['types'][Name] extends
      TypeValidator<infer Value> ? Value : unknown;
  }
  : Record<never, never>;

/** Infers custom parameter values from the i18n plugin in a shared configuration. */
export type InferConfiguredI18nTypes<Config extends DeftConfig> = Config['plugins'][number] extends
  infer Plugin ? Plugin extends I18nPlugin ? InferI18nTypes<Plugin> : never
  : never;

/** An invalid shared project or i18n plugin configuration. */
export class I18nConfigError extends Error {
  /**
   * Creates an i18n configuration error.
   *
   * @param message - Description of the invalid configuration.
   */
  constructor(message: string) {
    super(message);
    this.name = 'I18nConfigError';
  }
}

/**
 * Creates an i18n plugin for a shared Deft+ configuration.
 *
 * The returned descriptor preserves literal option types for generated resources and does not
 * initialize the runtime or perform synchronization.
 *
 * @example Add i18n to the project configuration
 * ```ts
 * export default {
 *   plugins: [
 *     i18n({
 *       defaultLocale: 'en',
 *       sync: { endpoint: 'https://example.com/api/i18n', interval: 60_000 },
 *     }),
 *   ],
 * };
 * ```
 *
 * @template Config - Literal i18n project configuration.
 * @param config - Options shared by the CLI and generated runtime.
 * @returns A typed i18n plugin descriptor.
 */
export function i18n<const Config extends I18nProjectConfig>(config: Config): I18nPlugin<Config> {
  validateI18nConfig(config);
  return Object.freeze({ name: I18N_PLUGIN_NAME, options: config });
}

/**
 * Gets the single i18n plugin from a shared Deft+ configuration.
 *
 * @param config - Imported default project configuration.
 * @returns The configured i18n plugin.
 *
 * @internal
 */
export function getI18nPlugin<const Config extends DeftConfig>(
  config: Config,
): Extract<Config['plugins'][number], I18nPlugin>;
/** Gets the i18n plugin after validating an unknown configuration value. */
export function getI18nPlugin(config: unknown): I18nPlugin;
export function getI18nPlugin(config: unknown): I18nPlugin {
  if (!isRecord(config) || !Array.isArray(config.plugins)) {
    throw new I18nConfigError('The default project export must contain a plugins array.');
  }

  const plugins = config.plugins.filter(
    (plugin): plugin is I18nPlugin => isRecord(plugin) && plugin.name === I18N_PLUGIN_NAME,
  );

  if (plugins.length === 0) {
    throw new I18nConfigError(`The project does not configure the "${I18N_PLUGIN_NAME}" plugin.`);
  }

  if (plugins.length > 1) {
    throw new I18nConfigError(`The project configures "${I18N_PLUGIN_NAME}" more than once.`);
  }

  validateI18nConfig(plugins[0].options);
  return plugins[0];
}

/**
 * Validates options required by both synchronization and runtime generation.
 *
 * @param config - Potential i18n project configuration.
 *
 * @internal
 */
function validateI18nConfig(config: unknown): asserts config is I18nProjectConfig {
  if (!isRecord(config)) {
    throw new I18nConfigError('The i18n plugin configuration must be an object.');
  }

  if (typeof config.defaultLocale !== 'string' || !config.defaultLocale.trim()) {
    throw new I18nConfigError('The i18n defaultLocale must be a non-empty string.');
  }

  if (!isRecord(config.sync) || typeof config.sync.endpoint !== 'string') {
    throw new I18nConfigError('The i18n sync endpoint must be a string.');
  }

  try {
    new URL(config.sync.endpoint);
  } catch {
    throw new I18nConfigError('The i18n sync endpoint must be an absolute URL.');
  }

  if (!Number.isFinite(config.sync.interval) || Number(config.sync.interval) < 0) {
    throw new I18nConfigError('The i18n sync interval must be a non-negative number.');
  }

  if (config.output !== undefined && (typeof config.output !== 'string' || !config.output.trim())) {
    throw new I18nConfigError('The i18n output must be a non-empty string when provided.');
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
