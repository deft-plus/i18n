// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

/**
 * Defines the augmentable translation schema and strongly typed runtime API.
 *
 * @module
 */

/** Translation namespaces and their canonical message strings. */
export interface Translation {}

/** Parameter types available in translation message declarations. */
export interface CustomTypes {
  /** A JavaScript string value. */
  string: string;
  /** A JavaScript number value. */
  number: number;
  /** A JavaScript boolean value. */
  boolean: boolean;
  /** A JavaScript date value. */
  Date: Date;
  /** A value without a declared compile-time type. */
  unknown: unknown;
}

/** Controls how runtime translation mistakes are handled. */
export type ValidationMode = 'throw' | 'warn' | false;

/** Translation messages grouped by namespace. */
export type Resource = Record<string, Record<string, string>>;

/** A module returned by a generated asynchronous resource import. */
export type ResourceModule = Resource | { default: Resource };

/** Loads one locale's translation resource. */
export type ResourceLoader = () => Promise<ResourceModule>;

/** Locale names mapped to inline resources or generated resource loaders. */
export type ResourceRegistry = Record<string, Resource | ResourceLoader>;

/** Information supplied to a custom value formatter. */
export interface FormatterContext {
  /** Locale currently rendering the translation. */
  locale: string;
}

/** Converts a translation parameter into a renderable value. */
export type Formatter<Value = never> = (
  value: Value,
  context: FormatterContext,
) => unknown;

/** Named custom formatters available to translation messages. */
export type FormatterRegistry = Record<string, Formatter>;

/** Validates a custom translation parameter at runtime. */
export type TypeValidator<Value> = (value: unknown) => value is Value;

/** Runtime validators keyed by augmentable translation type names. */
export type TypeValidatorRegistry = Partial<
  {
    [Name in keyof CustomTypes]: TypeValidator<CustomTypes[Name]>;
  }
>;

/** Remote translation synchronization settings. */
export interface SyncOptions {
  /** Explorer API endpoint returning one locale resource as JSON. */
  endpoint: string;
  /** Minimum milliseconds between background synchronization requests. */
  interval: number;
}

/** Locale fallback configuration. */
export type Fallbacks<Locale extends string> = Partial<
  Record<Locale | 'default', readonly Locale[]>
>;

/** Configuration accepted by {@link createI18n}. */
export interface CreateI18nOptions<
  Resources extends ResourceRegistry,
  Formatters extends FormatterRegistry = FormatterRegistry,
> {
  /** Initial locale, constrained to the configured resource locale names. */
  defaultLocale: Extract<keyof Resources, string>;
  /** Inline or asynchronously loaded locale resources. */
  resources: Resources;
  /** Custom value formatters referenced by translation messages. */
  formatters?: Formatters;
  /** Runtime validators for custom parameter types. */
  types?: TypeValidatorRegistry;
  /** Locale-specific and default fallback chains. */
  fallbacks?: Fallbacks<Extract<keyof Resources, string>>;
  /** Runtime mistake handling. Defaults to `throw`. */
  validation?: ValidationMode;
  /** Optional remote translation synchronization. */
  sync?: SyncOptions;
}

/** A runtime error produced while resolving or rendering a translation. */
export class I18nError extends Error {
  /**
   * Creates an internationalization runtime error.
   *
   * @param message - Description of the runtime failure.
   */
  constructor(message: string) {
    super(message);
    this.name = 'I18nError';
  }
}

/**
 * Removes plural expressions before parameter inference.
 * @internal
 */
export type WithoutPlurals<Message extends string> = Message extends
  `${infer Before}{{${string}}}${infer After}` ? `${Before}${WithoutPlurals<After>}`
  : Message;

/**
 * Extracts parameter declarations from a message.
 * @internal
 */
export type ParameterTokens<Message extends string> = WithoutPlurals<Message> extends
  `${string}{${infer Token}}${infer Rest}` ? Token | ParameterTokens<Rest>
  : never;

/**
 * Removes parameter transforms from a declaration.
 * @internal
 */
export type ParameterDeclaration<Token extends string> = Token extends
  `${infer Declaration}|${string}` ? Declaration
  : Token;

/**
 * Extracts a parameter's declared type name.
 * @internal
 */
export type ParameterTypeName<Token extends string> = ParameterDeclaration<Token> extends
  `${string}:${infer Type}` ? Type : 'unknown';

/**
 * Extracts a parameter's name without its optional marker.
 * @internal
 */
export type ParameterName<Token extends string> = ParameterDeclaration<Token> extends
  `${infer Name}:${string}` ? Name extends `${infer OptionalName}?` ? OptionalName : Name
  : ParameterDeclaration<Token> extends `${infer OptionalName}?` ? OptionalName
  : ParameterDeclaration<Token>;

/**
 * Reports whether a parameter declaration is optional.
 * @internal
 */
export type IsOptionalParameter<Token extends string> = ParameterDeclaration<Token> extends
  `${string}?:${string}` | `${string}?` ? true : false;

/**
 * Resolves a message type name through the augmentable custom type registry.
 * @internal
 */
export type ResolveParameterType<Token extends string> = ParameterTypeName<Token> extends
  keyof CustomTypes ? CustomTypes[ParameterTypeName<Token>]
  : unknown;

/**
 * Creates one required or optional parameter property.
 * @internal
 */
export type ParameterProperty<Token extends string> = IsOptionalParameter<Token> extends true
  ? { [Key in ParameterName<Token>]?: ResolveParameterType<Token> }
  : { [Key in ParameterName<Token>]: ResolveParameterType<Token> };

/**
 * Converts a union into an intersection.
 * @internal
 */
export type UnionToIntersection<Union> = (
  Union extends unknown ? (value: Union) => void : never
) extends (value: infer Intersection) => void ? Intersection
  : never;

/**
 * Produces the parameter object required by a message.
 * @internal
 */
export type MessageParameters<Message extends string> = UnionToIntersection<
  ParameterTokens<Message> extends infer Token extends string ? ParameterProperty<Token> : never
>;

/** Produces a callable translation from a canonical message string. */
export type TranslationFunction<Message extends string> = [ParameterTokens<Message>] extends [never]
  ? () => string
  : Record<string, never> extends MessageParameters<Message>
    ? (parameters?: MessageParameters<Message>) => string
  : (parameters: MessageParameters<Message>) => string;

/** Names of the namespaces supplied through module augmentation. */
export type Namespace = Extract<keyof Translation, string>;

/** Strongly typed translation functions belonging to one namespace. */
export type NamespaceTranslator<Name extends Namespace> = {
  [Key in keyof Translation[Name]]: Translation[Name][Key] extends string
    ? TranslationFunction<Translation[Name][Key]>
    : never;
};

/** The minimal internationalization runtime instance. */
export interface I18n<Locale extends string> {
  /** Currently active locale. */
  readonly locale: Locale;

  /**
   * Gets the strongly typed translations for a namespace.
   *
   * @param name - Namespace to access.
   * @returns Translation functions for every key in the namespace.
   */
  namespace<Name extends Namespace>(name: Name): NamespaceTranslator<Name>;

  /**
   * Loads or refreshes one configured locale resource.
   *
   * @param locale - Locale resource to load.
   * @returns A promise that settles when local and remote loading completes.
   */
  loadResource(locale: Locale): Promise<void>;

  /**
   * Loads and activates a configured locale.
   *
   * @param locale - Locale to activate.
   * @returns A promise that settles after the locale becomes active.
   */
  setLocale(locale: Locale): Promise<void>;
}

/**
 * Creates an isolated internationalization runtime.
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
 * @returns An isolated typed internationalization runtime.
 */
export type CreateI18n = <
  const Resources extends ResourceRegistry,
  const Formatters extends FormatterRegistry = FormatterRegistry,
>(
  options: CreateI18nOptions<Resources, Formatters>,
) => I18n<Extract<keyof Resources, string>>;
