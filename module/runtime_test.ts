// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

import { expect } from '@std/expect';
import { stub } from '@std/testing/mock';

import {
  createI18n,
  type I18n,
  I18nError,
  type Resource,
  type ResourceRegistry,
} from '@deft-plus/i18n';

declare module '@deft-plus/i18n' {
  interface Translation {
    common: {
      plain: 'Hello';
      welcome: 'Hello {name:userId}';
      optional: 'Hello {name?:string}';
      items: '{count:number} item{{|s}}';
      amount: 'Total: {value:number|currency}';
      owner: '{gender:string|{male:his,female:her,*:their}} account';
      missing: 'Missing';
      badFormatter: '{value:string|missingFormatter}';
      badSwitch: '{value:string|{yes:accepted}}';
      boolean: '{value:boolean}';
      date: '{value:Date}';
      unknown: '{value}';
      empty: '{value:string|empty}';
      simplePlural: '{count:number} apple{{s}}';
    };
  }

  interface CustomTypes {
    userId: number;
  }
}

/** English test translations. */
const ENGLISH: Resource = {
  common: {
    plain: 'Hello',
    welcome: 'Hello {name:userId}',
    optional: 'Hello {name?:string}',
    items: '{count:number} item{{|s}}',
    amount: 'Total: {value:number|currency}',
    owner: '{gender:string|{male:his,female:her,*:their}} account',
    badFormatter: '{value:string|missingFormatter}',
    badSwitch: '{value:string|{yes:accepted}}',
    boolean: '{value:boolean}',
    date: '{value:Date}',
    unknown: '{value}',
    empty: '{value:string|empty}',
    simplePlural: '{count:number} apple{{s}}',
  },
};

/** Creates the standard runtime used by behavior tests. */
function createTestI18n(): I18n<'en' | 'es' | 'fr'> {
  return createI18n({
    defaultLocale: 'en',
    resources: {
      en: ENGLISH,
      es: { common: { plain: 'Hola' } },
      fr: () =>
        Promise.resolve({
          default: { common: { plain: 'Bonjour', welcome: 'Bonjour {name:userId}' } },
        }),
    },
    formatters: {
      currency: (value: number, { locale }) => `${locale}:${value.toFixed(2)}`,
      empty: (_value: string) => null,
    },
    types: {
      userId: (value): value is number => typeof value === 'number' && Number.isFinite(value),
    },
    fallbacks: {
      es: ['en'],
      fr: ['en'],
    },
  });
}

/** Verifies consumer-facing compile-time errors without executing them. */
const _typeTests = (): void => {
  const i18n = createTestI18n();
  const common = i18n.namespace('common');

  // @ts-expect-error The generated custom type requires a number.
  common.welcome({ name: 'Ada' });
  // @ts-expect-error Required translation parameters cannot be omitted.
  common.welcome();
  // @ts-expect-error Parameterless translations do not accept an object.
  common.plain({});
  // @ts-expect-error Plural parameters are inferred as numbers.
  common.items({ count: 'two' });
  // @ts-expect-error The namespace is generated from Translation.
  i18n.namespace('unknown');
  // @ts-expect-error Locale names are inferred from configured resources.
  i18n.setLocale('de');
};

Deno.test('createI18n() should expose a typed default locale and namespace', () => {
  const i18n = createTestI18n();
  const locale: 'en' | 'es' | 'fr' = i18n.locale;
  const common = i18n.namespace('common');

  expect(locale).toBe('en');
  expect(common.plain()).toBe('Hello');
  expect(common.welcome({ name: 42 })).toBe('Hello 42');
  expect(common.optional()).toBe('Hello ');
  expect(common.optional({ name: 'Ada' })).toBe('Hello Ada');
});

Deno.test('i18n.namespace() should render plurals with the active locale', () => {
  const common = createTestI18n().namespace('common');

  expect(common.items({ count: 1 })).toBe('1 item');
  expect(common.items({ count: 2 })).toBe('2 items');
  expect(common.simplePlural({ count: 1 })).toBe('1 apples');
});

Deno.test('i18n.namespace() should apply formatters with locale context', () => {
  const common = createTestI18n().namespace('common');

  expect(common.amount({ value: 12.5 })).toBe('Total: en:12.50');
  expect(common.empty({ value: 'discarded' })).toBe('');
});

Deno.test('i18n.namespace() should apply switch cases and their fallback', () => {
  const common = createTestI18n().namespace('common');

  expect(common.owner({ gender: 'male' })).toBe('his account');
  expect(common.owner({ gender: 'unknown' })).toBe('their account');
});

Deno.test('i18n.setLocale() should load and activate an asynchronous resource', async () => {
  const i18n = createTestI18n();

  await i18n.setLocale('fr');

  expect(i18n.locale).toBe('fr');
  expect(i18n.namespace('common').plain()).toBe('Bonjour');
  expect(i18n.namespace('common').welcome({ name: 7 })).toBe('Bonjour 7');
});

Deno.test('i18n.loadResource() should load without changing the active locale', async () => {
  const i18n = createTestI18n();

  await i18n.loadResource('fr');

  expect(i18n.locale).toBe('en');
  expect(i18n.namespace('common').plain()).toBe('Hello');
});

Deno.test('i18n.namespace() should resolve locale fallbacks', async () => {
  const i18n = createTestI18n();
  await i18n.setLocale('es');
  const common = i18n.namespace('common');

  expect(common.plain()).toBe('Hola');
  expect(common.welcome({ name: 5 })).toBe('Hello 5');
});

Deno.test('i18n.setLocale() should preload asynchronous fallback resources', async () => {
  const i18n = createI18n({
    defaultLocale: 'en',
    resources: {
      en: () => Promise.resolve(ENGLISH),
      es: () => Promise.resolve({ common: { plain: 'Hola' } }),
    },
    fallbacks: { es: ['en'] },
  });

  await i18n.setLocale('es');

  expect(i18n.namespace('common').welcome({ name: 9 })).toBe('Hello 9');
});

Deno.test('createI18n() should use default fallbacks', async () => {
  const i18n = createI18n({
    defaultLocale: 'en',
    resources: {
      en: ENGLISH,
      es: { common: { plain: 'Hola' } },
    },
    fallbacks: { default: ['en'] },
  });

  await i18n.setLocale('es');

  expect(i18n.namespace('common').welcome({ name: 3 })).toBe('Hello 3');
});

Deno.test('createI18n() should throw for runtime mistakes by default', () => {
  const common = createTestI18n().namespace('common');

  expect(() => common.welcome({} as { name: number })).toThrow(I18nError);
  expect(() => common.welcome({ name: 'wrong' } as unknown as { name: number })).toThrow(
    'must have type "userId"',
  );
  expect(() => common.items({ count: Number.NaN })).toThrow('must have type "number"');
  expect(() => common.badFormatter({ value: 'test' })).toThrow('is not configured');
  expect(() => common.badSwitch({ value: 'no' })).toThrow('no match');
  expect(() => common.missing()).toThrow('is missing');
  const plainFromJavaScript = common.plain as unknown as (
    parameters: Record<string, unknown>,
  ) => string;
  expect(() => plainFromJavaScript({ unexpected: true })).toThrow('is not declared');
});

Deno.test('createI18n() should validate built-in parameter types', () => {
  const common = createTestI18n().namespace('common');

  expect(() => common.boolean({ value: 1 } as unknown as { value: boolean })).toThrow(
    'must have type "boolean"',
  );
  expect(() => common.date({ value: new Date('invalid') })).toThrow('must have type "Date"');
  expect(common.unknown({ value: { id: 1 } })).toBe('[object Object]');
});

Deno.test('i18n.namespace() should safely ignore symbol property access', () => {
  const common = createTestI18n().namespace('common');

  expect(Reflect.get(common, Symbol.iterator)).toBe(undefined);
});

Deno.test('createI18n() should warn and continue when validation is warn', () => {
  using warning = stub(console, 'warn', () => {});
  const i18n = createI18n({
    defaultLocale: 'en',
    resources: { en: { common: {} } },
    validation: 'warn',
  });

  expect(i18n.namespace('common').missing()).toBe('common.missing');
  expect(warning.calls.length).toBe(1);
});

Deno.test('createI18n() should ignore runtime mistakes when validation is false', () => {
  const i18n = createI18n({
    defaultLocale: 'en',
    resources: { en: { common: { items: '{count:number} item{{|s}}' } } },
    validation: false,
  });
  const common = i18n.namespace('common');

  expect(common.missing()).toBe('common.missing');
  expect(common.items({ count: Number.NaN })).toBe('NaN items');
});

Deno.test('i18n.loadResource() should synchronize remote translations', async () => {
  using fetchStub = stub(globalThis, 'fetch', (input) => {
    expect(String(input)).toBe('https://example.com/api/i18n?source=test&locale=en');
    return Promise.resolve(Response.json({ common: { plain: 'Remote hello' } }));
  });
  const i18n = createI18n({
    defaultLocale: 'en',
    resources: { en: ENGLISH },
    sync: {
      endpoint: 'https://example.com/api/i18n?source=test',
      interval: 60_000,
    },
  });

  await i18n.loadResource('en');

  expect(fetchStub.calls.length).toBe(1);
  expect(i18n.namespace('common').plain()).toBe('Remote hello');
});

Deno.test('i18n.setLocale() should reuse an active synchronization interval', async () => {
  using fetchStub = stub(
    globalThis,
    'fetch',
    () => Promise.resolve(Response.json({ common: { plain: 'Remote hello' } })),
  );
  const i18n = createI18n({
    defaultLocale: 'en',
    resources: { en: ENGLISH },
    sync: { endpoint: 'https://example.com/api/i18n', interval: 60_000 },
  });

  await i18n.loadResource('en');
  await i18n.setLocale('en');
  i18n.namespace('common').plain();

  expect(fetchStub.calls.length).toBe(1);
});

Deno.test('i18n.loadResource() should reject unsuccessful synchronization', async () => {
  using _fetchStub = stub(
    globalThis,
    'fetch',
    () => Promise.resolve(new Response(null, { status: 503, statusText: 'Unavailable' })),
  );
  const i18n = createI18n({
    defaultLocale: 'en',
    resources: { en: ENGLISH },
    sync: { endpoint: 'https://example.com/api/i18n', interval: 1 },
  });

  await expect(i18n.loadResource('en')).rejects.toThrow('503 Unavailable');
});

Deno.test('i18n.loadResource() should reject invalid local and remote resources', async () => {
  const invalidLoader = () => Promise.resolve({ default: { common: { key: 1 } } });
  const resources: ResourceRegistry = { en: invalidLoader as unknown as () => Promise<Resource> };
  const localI18n = createI18n({ defaultLocale: 'en', resources });

  await expect(localI18n.loadResource('en')).rejects.toThrow('must contain string messages');

  using _fetchStub = stub(
    globalThis,
    'fetch',
    () => Promise.resolve(Response.json({ invalid: 1 })),
  );
  const remoteI18n = createI18n({
    defaultLocale: 'en',
    resources: { en: ENGLISH },
    sync: { endpoint: 'https://example.com/api/i18n', interval: 1 },
  });

  await expect(remoteI18n.loadResource('en')).rejects.toThrow('must contain string messages');
});

Deno.test('i18n.loadResource() should share a concurrent locale load', async () => {
  const pending = Promise.withResolvers<Resource>();
  let calls = 0;
  const i18n = createI18n({
    defaultLocale: 'en',
    resources: {
      en: async () => {
        calls += 1;
        return await pending.promise;
      },
    },
  });

  const first = i18n.loadResource('en');
  const second = i18n.loadResource('en');
  pending.resolve(ENGLISH);
  await Promise.all([first, second]);

  expect(calls).toBe(1);
});

Deno.test('i18n.loadResource() should reject un-configured JavaScript locales', async () => {
  const i18n: I18n<string> = createTestI18n();

  await expect(i18n.loadResource('de')).rejects.toThrow('is not configured');
});

Deno.test('i18n.namespace() should warn when background synchronization fails', async () => {
  using _fetchStub = stub(globalThis, 'fetch', () => Promise.reject('offline'));
  const warned = Promise.withResolvers<void>();
  using warning = stub(console, 'warn', () => warned.resolve());
  const i18n = createI18n({
    defaultLocale: 'en',
    resources: { en: ENGLISH },
    validation: 'warn',
    sync: { endpoint: 'https://example.com/api/i18n', interval: 1 },
  });

  expect(i18n.namespace('common').plain()).toBe('Hello');
  await warned.promise;

  expect(warning.calls.length).toBe(1);
});

Deno.test('createI18n() should reject invalid configuration and inline resources', () => {
  const resources: ResourceRegistry = { en: ENGLISH };

  expect(() => createI18n({ defaultLocale: 'missing', resources })).toThrow('not configured');
  expect(() =>
    createI18n({
      defaultLocale: 'en',
      resources,
      sync: { endpoint: '', interval: 0 },
    })
  ).toThrow('positive interval');

  const invalidResources = { en: { common: { key: 1 } } } as unknown as ResourceRegistry;
  expect(() => createI18n({ defaultLocale: 'en', resources: invalidResources })).toThrow(
    'must contain string messages',
  );

  const primitiveResource = { en: 1 } as unknown as ResourceRegistry;
  expect(() => createI18n({ defaultLocale: 'en', resources: primitiveResource })).toThrow(
    'must contain string messages',
  );
});
