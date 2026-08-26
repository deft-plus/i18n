// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

/**
 * Implements locale resource loading and translation message rendering.
 *
 * @module
 */

import {
  type CreateI18n,
  type CreateI18nOptions,
  type FormatterContext,
  type FormatterRegistry,
  type I18n,
  I18nError,
  type Namespace,
  type NamespaceTranslator,
  type Resource,
  type ResourceLoader,
  type ResourceRegistry,
} from './runtime_api.ts';
import { type ParameterPart, parseText, type PluralPart, type SwitchCasePart } from './parser.ts';

/**
 * Cached parsed messages shared by runtime instances.
 * @internal
 */
const PARSED_MESSAGES = new Map<string, ReturnType<typeof parseText>>();

/**
 * Built-in parameter validators.
 * @internal
 */
const TYPE_VALIDATORS: Readonly<Record<string, (value: unknown) => boolean>> = {
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  boolean: (value) => typeof value === 'boolean',
  Date: (value) => value instanceof Date && !Number.isNaN(value.valueOf()),
  unknown: () => true,
};

/**
 * Configured locale names inferred from a resource registry.
 * @internal
 */
type ResourceLocale<Resources extends ResourceRegistry> = Extract<keyof Resources, string>;

/**
 * Stateful internationalization runtime created by {@link createI18n}.
 * @internal
 */
class I18nRuntime<
  Resources extends ResourceRegistry,
  Formatters extends FormatterRegistry,
> implements I18n<ResourceLocale<Resources>> {
  /**
   * Runtime configuration supplied by the consumer.
   * @internal
   */
  readonly #options: CreateI18nOptions<Resources, Formatters>;

  /**
   * Loaded locale resources.
   * @internal
   */
  readonly #loadedResources = new Map<string, Resource>();

  /**
   * Locale loads currently in progress.
   * @internal
   */
  readonly #loadingResources = new Map<string, Promise<void>>();

  /**
   * Most recent successful synchronization time per locale.
   * @internal
   */
  readonly #lastSynchronized = new Map<string, number>();

  /**
   * Built-in and consumer-provided runtime type validators.
   * @internal
   */
  readonly #typeValidators: Readonly<Record<string, (value: unknown) => boolean>>;

  /**
   * Active runtime validation behavior.
   * @internal
   */
  readonly #validation: 'throw' | 'warn' | false;

  /**
   * Currently active locale.
   * @internal
   */
  #activeLocale: ResourceLocale<Resources>;

  /**
   * Creates a stateful internationalization runtime.
   *
   * @param options - Runtime resources and behavior.
   *
   * @internal
   */
  constructor(options: CreateI18nOptions<Resources, Formatters>) {
    validateOptions(options);

    this.#options = options;
    this.#typeValidators = { ...TYPE_VALIDATORS, ...options.types };
    this.#validation = options.validation ?? 'throw';
    this.#activeLocale = options.defaultLocale;

    for (const [locale, resource] of Object.entries(options.resources)) {
      if (typeof resource !== 'function') {
        assertResource(resource, `Resource for locale "${locale}"`);
        this.#loadedResources.set(locale, resource);
      }
    }
  }

  /** Currently active locale. */
  get locale(): ResourceLocale<Resources> {
    return this.#activeLocale;
  }

  /**
   * Gets the strongly typed translations for a namespace.
   *
   * @param name - Namespace to access.
   * @returns Translation functions for every key in the namespace.
   */
  namespace<Name extends Namespace>(name: Name): NamespaceTranslator<Name> {
    const translator = new Proxy(Object.create(null) as Record<string, unknown>, {
      get: (_target, key): unknown => {
        if (typeof key !== 'string') {
          return undefined;
        }

        return (parameters: Readonly<Record<string, unknown>> = {}) =>
          this.#translate(name, key, parameters);
      },
    });

    // A proxy is required because generated translation keys may be loaded asynchronously.
    return translator as NamespaceTranslator<Name>;
  }

  /**
   * Loads or refreshes one configured locale resource.
   *
   * @param locale - Locale resource to load.
   * @returns A promise that settles when local and remote loading completes.
   */
  async loadResource(locale: ResourceLocale<Resources>): Promise<void> {
    await this.#load(locale, true);
  }

  /**
   * Loads and activates a configured locale and its fallbacks.
   *
   * @param locale - Locale to activate.
   * @returns A promise that settles after the locale becomes active.
   */
  async setLocale(locale: ResourceLocale<Resources>): Promise<void> {
    await Promise.all(
      getLocaleChain(locale, this.#options.fallbacks).map((resourceLocale) =>
        this.#load(resourceLocale, false)
      ),
    );
    this.#activeLocale = locale;
  }

  /**
   * Reports a recoverable runtime error according to the configured validation mode.
   *
   * @param message - Runtime error description.
   *
   * @internal
   */
  #report(message: string): void {
    if (this.#validation === 'throw') {
      throw new I18nError(message);
    }

    if (this.#validation === 'warn') {
      // deno-lint-ignore no-console -- Warning is the explicit behavior selected by the consumer.
      console.warn(`[i18n] ${message}`);
    }
  }

  /**
   * Synchronizes one locale with the configured remote endpoint.
   *
   * @param locale - Locale to synchronize.
   * @param force - Whether to ignore the synchronization interval.
   * @returns A promise that settles when synchronization completes.
   *
   * @internal
   */
  async #synchronize(locale: ResourceLocale<Resources>, force: boolean): Promise<void> {
    const sync = this.#options.sync;

    if (!sync) {
      return;
    }

    const lastUpdate = this.#lastSynchronized.get(locale) ?? 0;

    if (!force && Date.now() - lastUpdate < sync.interval) {
      return;
    }

    const separator = sync.endpoint.includes('?') ? '&' : '?';
    const response = await fetch(
      `${sync.endpoint}${separator}locale=${encodeURIComponent(locale)}`,
    );

    if (!response.ok) {
      throw new I18nError(
        `Could not synchronize locale "${locale}": ${response.status} ${response.statusText}.`,
      );
    }

    const resource = unwrapResource(
      await response.json(),
      `Remote resource for locale "${locale}"`,
    );
    this.#loadedResources.set(locale, resource);
    this.#lastSynchronized.set(locale, Date.now());
  }

  /**
   * Loads a generated resource and optionally refreshes it remotely.
   *
   * @param locale - Locale resource to load.
   * @param forceSync - Whether to force a remote refresh.
   * @returns A promise that settles when loading completes.
   *
   * @internal
   */
  async #load(locale: ResourceLocale<Resources>, forceSync: boolean): Promise<void> {
    const currentLoad = this.#loadingResources.get(locale);

    if (currentLoad) {
      await currentLoad;
      return;
    }

    const promise = this.#loadUncached(locale, forceSync);
    this.#loadingResources.set(locale, promise);

    try {
      await promise;
    } finally {
      this.#loadingResources.delete(locale);
    }
  }

  /**
   * Performs an uncached locale load.
   *
   * @param locale - Locale resource to load.
   * @param forceSync - Whether to force a remote refresh.
   * @returns A promise that settles when loading completes.
   *
   * @internal
   */
  async #loadUncached(locale: ResourceLocale<Resources>, forceSync: boolean): Promise<void> {
    const input = this.#options.resources[locale];

    if (!input) {
      throw new I18nError(`Locale "${locale}" is not configured.`);
    }

    if (!this.#loadedResources.has(locale)) {
      // Inline resources are initialized during construction, so an unloaded input is a loader.
      const module = await (input as ResourceLoader)();
      this.#loadedResources.set(
        locale,
        unwrapResource(module, `Resource for locale "${locale}"`),
      );
    }

    await this.#synchronize(locale, forceSync);
  }

  /**
   * Starts a non-blocking refresh when a synchronized locale becomes stale.
   *
   * @param locale - Locale that may need refreshing.
   *
   * @internal
   */
  #refreshIfStale(locale: ResourceLocale<Resources>): void {
    const sync = this.#options.sync;

    if (!sync || this.#loadingResources.has(locale)) {
      return;
    }

    const lastUpdate = this.#lastSynchronized.get(locale) ?? 0;

    if (Date.now() - lastUpdate < sync.interval) {
      return;
    }

    void this.#load(locale, false).catch((error: unknown) => {
      if (this.#validation === 'warn') {
        this.#report(String(error));
      }
    });
  }

  /**
   * Finds a message in the active locale and its configured fallbacks.
   *
   * @param namespace - Translation namespace.
   * @param key - Translation key.
   * @returns The resolved message, or `undefined` when it is missing.
   *
   * @internal
   */
  #findMessage(namespace: string, key: string): string | undefined {
    const locales = getLocaleChain(this.#activeLocale, this.#options.fallbacks);

    for (const locale of locales) {
      const message = this.#loadedResources.get(locale)?.[namespace]?.[key];

      if (message !== undefined) {
        return message;
      }
    }

    return undefined;
  }

  /**
   * Renders one typed translation function invocation.
   *
   * @param namespace - Translation namespace.
   * @param key - Translation key.
   * @param parameters - Runtime translation parameters.
   * @returns The rendered translation.
   *
   * @internal
   */
  #translate(
    namespace: string,
    key: string,
    parameters: Readonly<Record<string, unknown>>,
  ): string {
    this.#refreshIfStale(this.#activeLocale);

    const message = this.#findMessage(namespace, key);

    if (message === undefined) {
      this.#report(
        `Translation "${namespace}.${key}" is missing for locale "${this.#activeLocale}".`,
      );
      return `${namespace}.${key}`;
    }

    const parts = getParsedMessage(message);
    const report = (error: string): void => this.#report(error);
    validateParameterKeys(parts, parameters, report);
    let output = '';

    for (const part of parts) {
      if (part.kind === 'text') {
        output += part.content;
      } else if (part.kind === 'parameter') {
        output += renderParameter(
          part,
          parameters,
          this.#activeLocale,
          this.#options.formatters,
          this.#typeValidators,
          report,
        );
      } else {
        output += renderPlural(part, parameters, this.#activeLocale, report);
      }
    }

    return output;
  }
}

/**
 * Creates an isolated, strongly typed internationalization runtime.
 *
 * @example Usage
 * ```ts
 * const i18n = createI18n({
 *   defaultLocale: 'en',
 *   resources: { en: { common: { greeting: 'Hello' } } },
 * });
 * ```
 *
 * @template Resources - Configured locale resource registry.
 * @template Formatters - Configured custom formatter registry.
 * @param options - Runtime resources and behavior.
 * @returns A new isolated internationalization runtime instance.
 */
export const createI18n: CreateI18n = <
  const Resources extends ResourceRegistry,
  const Formatters extends FormatterRegistry = FormatterRegistry,
>(
  options: CreateI18nOptions<Resources, Formatters>,
): I18n<ResourceLocale<Resources>> => new I18nRuntime(options);

/**
 * Returns a locale followed by its unique configured fallbacks.
 *
 * @param locale - Primary locale.
 * @param fallbacks - Configured locale fallback chains.
 * @returns The ordered unique locale chain.
 *
 * @internal
 */
function getLocaleChain<Locale extends string>(
  locale: Locale,
  fallbacks: Partial<Record<Locale | 'default', readonly Locale[]>> | undefined,
): Locale[] {
  return [...new Set([locale, ...(fallbacks?.[locale] ?? []), ...(fallbacks?.default ?? [])])];
}

/**
 * Validates configuration values that cannot be enforced by TypeScript.
 *
 * @param options - Runtime configuration to validate.
 *
 * @internal
 */
function validateOptions<
  Resources extends ResourceRegistry,
  Formatters extends FormatterRegistry,
>(options: CreateI18nOptions<Resources, Formatters>): void {
  if (!Object.hasOwn(options.resources, options.defaultLocale)) {
    throw new I18nError(`Default locale "${options.defaultLocale}" is not configured.`);
  }

  if (options.sync && (!options.sync.endpoint || options.sync.interval <= 0)) {
    throw new I18nError('Sync requires a non-empty endpoint and a positive interval.');
  }
}

/**
 * Returns a cached parsed translation message.
 *
 * @param message - Translation message to parse.
 * @returns The cached or newly parsed message parts.
 *
 * @internal
 */
function getParsedMessage(message: string): ReturnType<typeof parseText> {
  const cached = PARSED_MESSAGES.get(message);

  if (cached) {
    return cached;
  }

  const parsed = parseText(message);
  PARSED_MESSAGES.set(message, parsed);
  return parsed;
}

/**
 * Reports parameters that are not declared by a parsed message.
 *
 * @param parts - Parsed translation message.
 * @param parameters - Supplied runtime parameters.
 * @param report - Runtime validation reporter.
 *
 * @internal
 */
function validateParameterKeys(
  parts: ReturnType<typeof parseText>,
  parameters: Readonly<Record<string, unknown>>,
  report: (message: string) => void,
): void {
  const expected = new Set<string>();

  for (const part of parts) {
    if (part.kind === 'parameter' || part.kind === 'plural') {
      expected.add(part.key);
    }
  }

  for (const key of Object.keys(parameters)) {
    if (!expected.has(key)) {
      report(`Parameter "${key}" is not declared by the translation.`);
    }
  }
}

/**
 * Renders and transforms one parameter.
 *
 * @param part - Parsed parameter declaration.
 * @param parameters - Supplied runtime parameters.
 * @param locale - Active locale.
 * @param formatters - Configured formatter registry.
 * @param typeValidators - Available runtime type validators.
 * @param report - Runtime validation reporter.
 * @returns The rendered parameter value.
 *
 * @internal
 */
function renderParameter(
  part: ParameterPart,
  parameters: Readonly<Record<string, unknown>>,
  locale: string,
  formatters: FormatterRegistry | undefined,
  typeValidators: Readonly<Record<string, (value: unknown) => boolean>>,
  report: (message: string) => void,
): string {
  if (!Object.hasOwn(parameters, part.key)) {
    if (!part.optional) {
      report(`Required parameter "${part.key}" is missing.`);
    }

    return '';
  }

  let value = parameters[part.key];
  const validator = typeValidators[part.type];

  if (validator && !validator(value)) {
    report(`Parameter "${part.key}" must have type "${part.type}".`);
  }

  for (const transform of part.transforms) {
    value = transform.kind === 'formatter'
      ? applyFormatter(transform.name, value, locale, formatters, report)
      : applySwitchCase(transform, value, report);
  }

  return value === undefined || value === null ? '' : String(value);
}

/**
 * Applies a configured formatter to a parameter value.
 *
 * @param name - Formatter name.
 * @param value - Parameter value.
 * @param locale - Active locale.
 * @param formatters - Configured formatter registry.
 * @param report - Runtime validation reporter.
 * @returns The formatted value.
 *
 * @internal
 */
function applyFormatter(
  name: string,
  value: unknown,
  locale: string,
  formatters: FormatterRegistry | undefined,
  report: (message: string) => void,
): unknown {
  const formatter = formatters?.[name];

  if (!formatter) {
    report(`Formatter "${name}" is not configured.`);
    return value;
  }

  const context: FormatterContext = { locale };
  return Reflect.apply(formatter, undefined, [value, context]);
}

/**
 * Selects the matching replacement from a switch-case transform.
 *
 * @param transform - Parsed switch-case transform.
 * @param value - Parameter value used as the case key.
 * @param report - Runtime validation reporter.
 * @returns The matching replacement text.
 *
 * @internal
 */
function applySwitchCase(
  transform: SwitchCasePart,
  value: unknown,
  report: (message: string) => void,
): string {
  const key = String(value);
  const matched = transform.cases.find((entry) => entry.key === key) ??
    transform.cases.find((entry) => entry.key === '*');

  if (!matched) {
    report(`Switch case has no match for "${key}" and no fallback.`);
    return '';
  }

  return matched.value;
}

/**
 * Selects and renders a locale-aware plural value.
 *
 * @param part - Parsed plural declaration.
 * @param parameters - Supplied runtime parameters.
 * @param locale - Active locale.
 * @param report - Runtime validation reporter.
 * @returns The selected plural text.
 *
 * @internal
 */
function renderPlural(
  part: PluralPart,
  parameters: Readonly<Record<string, unknown>>,
  locale: string,
  report: (message: string) => void,
): string {
  const value = parameters[part.key];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    report(`Plural parameter "${part.key}" must be a finite number.`);
    return part.other;
  }

  const category = new Intl.PluralRules(locale).select(value);
  return part[category] ?? part.other;
}

/**
 * Extracts a resource from an inline value or imported module.
 *
 * @param value - Inline resource or imported module.
 * @param label - Resource label used in validation errors.
 * @returns The validated resource.
 *
 * @internal
 */
function unwrapResource(value: unknown, label: string): Resource {
  if (isResource(value)) {
    return value;
  }

  if (typeof value === 'object' && value !== null && 'default' in value) {
    const module = value as { default: unknown };

    if (isResource(module.default)) {
      return module.default;
    }
  }

  throw new I18nError(`${label} must contain string messages grouped by namespace.`);
}

/**
 * Asserts that a configured value is a valid resource.
 *
 * @param value - Configured resource value.
 * @param label - Resource label used in validation errors.
 *
 * @internal
 */
function assertResource(value: unknown, label: string): asserts value is Resource {
  if (!isResource(value)) {
    throw new I18nError(`${label} must contain string messages grouped by namespace.`);
  }
}

/**
 * Reports whether a value is a valid translation resource.
 *
 * @param value - Value to inspect.
 * @returns Whether the value contains string messages grouped by namespace.
 *
 * @internal
 */
function isResource(value: unknown): value is Resource {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return Object.values(value).every((namespace) =>
    typeof namespace === 'object' &&
    namespace !== null &&
    Object.values(namespace).every((message) => typeof message === 'string')
  );
}
