# 🌍 I18n

[![JSR](https://jsr.io/badges/@deft-plus/i18n)](https://jsr.io/@deft-plus/i18n) [![JSR Score](https://jsr.io/badges/@deft-plus/i18n/score)](https://jsr.io/@deft-plus/i18n)

`@deft-plus/i18n` provides a dependency-free, strongly typed internationalization runtime and a Cliffy-powered synchronization CLI for frontend, backend, API, and server-rendered TypeScript applications.

The wider project is designed around three areas:

- **Runtime:** loads locale resources and renders type-safe translations.
- **CLI:** downloads resources and generates TypeScript declarations and an isolated runtime factory.
- **Explorer:** will manage locales, namespaces, translation keys, and values through a self-hosted API and interface.

The runtime, translation text parser, shared project configuration, and synchronization CLI are implemented. The Explorer remains planned work.

## Installation

Install the package using Deno:

```bash
deno add jsr:@deft-plus/i18n
```

Or add it to an npm project through JSR:

```bash
npx jsr add @deft-plus/i18n
```

Add a project-local task to `deno.json` or `deno.jsonc`. The task runs the CLI export from the installed dependency, so it uses the version selected by the project configuration and `deno.lock`:

```jsonc
{
  "tasks": {
    "i18n": "deno --allow-read=. --allow-write=. --allow-net=example.com @deft-plus/i18n/cli"
  }
}
```

Replace `example.com` with the hostname used by `sync.endpoint`. Run CLI commands through the task:

```bash
deno task i18n sync
deno task i18n --version
deno task i18n -v
```

Installing the package with `deno add` does not create a global executable. If a global `i18n` command is preferred, install the CLI export separately with the permissions required to discover configuration, write generated files, and contact the configured endpoint:

```bash
deno install --global --name i18n --allow-read --allow-write --allow-net jsr:@deft-plus/i18n/cli
```

The global installation allows `i18n sync`, `i18n --version`, and `i18n -v` without `deno task`.

## Shared project configuration

The CLI discovers one shared Deft+ configuration by searching upward from the current directory. It supports `deft.config.ts`, `.mts`, `.cts`, `.js`, `.mjs`, and `.cjs` in that order. Pass `--config` to use any explicit configuration path.

The default export is a plain object. No `defineConfig` wrapper is required:

```ts
import { i18n } from '@deft-plus/i18n/config';

export default {
  plugins: [
    i18n({
      defaultLocale: 'en',
      output: './.translations',
      sync: {
        endpoint: 'https://example.com/api/i18n',
        interval: 60_000,
      },
      fallbacks: {
        es: ['en'],
        default: ['en'],
      },
      formatters: {
        currency: (value: number, { locale }) =>
          new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'USD',
          }).format(value),
      },
      types: {
        userId: (value): value is number => typeof value === 'number',
      },
      validation: 'throw',
    }),
  ],
};
```

Other Deft+ plugins can be added to the same `plugins` array in the future. The i18n plugin does not create a runtime or perform network work while defining the configuration.

The generated runtime imports this shared configuration to reuse formatter and validator functions. Keep its top-level code side-effect free and compatible with every environment where the runtime is bundled. Do not place server secrets in configuration that may reach browser code.

## Synchronizing resources

Run synchronization through the project-local task from anywhere beneath the project configuration:

```bash
deno task i18n sync
deno task i18n sync --config ./configuration/deft.config.mjs
```

The equivalent commands are `i18n sync` and `i18n sync --config ...` when the optional global executable is installed.

The CLI sends a `GET` request to `sync.endpoint`. The response must contain a complete locale snapshot:

```json
{
  "resources": {
    "en": {
      "common": {
        "greeting": "Hello {name:userId}"
      }
    },
    "es": {
      "common": {
        "greeting": "Hola {name:userId}"
      }
    }
  }
}
```

Before replacing existing output, the CLI validates the default locale, fallback locales, resource structure, message syntax, custom parameter types, and formatter references. Successful synchronization writes deterministic generated artifacts atomically:

```text
.translations/
├── manifest.json
├── resources.generated.ts
├── runtime.generated.ts
└── resources/
    ├── en.json
    └── es.json
```

Create the application runtime from the generated SSR-safe factory:

```ts
import { createI18n } from './.translations/runtime.generated.ts';

export const i18n = createI18n();
```

Call the factory per request when SSR locale state must be isolated.

## Translation schema

The CLI generates module augmentation describing every namespace, key, message, and custom parameter type. It can also be written manually:

```ts
declare module '@deft-plus/i18n' {
  interface Translation {
    common: {
      greeting: 'Hello';
      welcome: 'Hello {name:userId}';
      items: '{count:number} item{{|s}}';
    };

    account: {
      owner: '{gender:string|{male:his,female:her,*:their}} account';
    };
  }

  interface CustomTypes {
    userId: number;
  }
}
```

Message literal types determine each generated translation function's parameter object. Missing namespaces, keys, parameters, and incorrect parameter types are rejected by TypeScript.

## Creating a runtime

Resources are grouped by locale and then namespace. A locale can be an inline resource or an asynchronous loader.

```ts
import { createI18n } from '@deft-plus/i18n';

export const i18n = createI18n({
  defaultLocale: 'en',
  resources: {
    en: {
      common: {
        greeting: 'Hello',
        welcome: 'Hello {name:userId}',
        items: '{count:number} item{{|s}}',
      },
      account: {
        owner: '{gender:string|{male:his,female:her,*:their}} account',
      },
    },
    es: () =>
      import('./.translations/resources/es.json', {
        with: { type: 'json' },
      }),
  },
  fallbacks: {
    es: ['en'],
    default: ['en'],
  },
  formatters: {
    currency: (value: number, { locale }) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
      }).format(value),
  },
  types: {
    userId: (value): value is number => typeof value === 'number',
  },
  validation: 'throw',
});
```

The runtime accepts resources rather than a filesystem path so the same API works in browsers, Deno, Node.js, server-rendered applications, and bundlers. Resolving a configured `resourcesPath` and generating importable loaders belongs to the CLI.

## Using translations

```ts
import { i18n } from './i18n.ts';

const common = i18n.namespace('common');

common.greeting();
common.welcome({ name: 42 });
common.items({ count: 2 });

await i18n.setLocale('es');
console.log(i18n.locale);
```

The runtime instance intentionally has a small API:

- `locale` exposes the active locale as a readonly property.
- `namespace(name)` returns strongly typed translation functions.
- `loadResource(locale)` loads or refreshes a locale without activating it.
- `setLocale(locale)` loads the locale and its fallbacks before activating it.

Create an instance per request when locale state must be isolated during SSR.

## Message syntax

Parameters use single braces:

```text
Hello {name:string}
Hello {name?:string}
```

Plural expressions use double braces and select categories through `Intl.PluralRules`:

```text
{count:number} item{{|s}}
{{count:no items|one item|many items}}
{{count:zero|one|two|few|many|other}}
```

Formatters use pipe-delimited names:

```text
Total: {value:number|currency}
```

Switch cases use a brace-delimited transform and may include a `*` fallback:

```text
{gender:string|{male:his,female:her,*:their}} account
```

Grammar delimiters can be escaped with a backslash inside values.

## Runtime validation

Set `validation` to one of:

- `'throw'` to throw an `I18nError` for runtime mistakes. This is the default.
- `'warn'` to log the mistake and continue with a safe fallback.
- `false` to disable runtime mistake reporting.

Runtime validation covers missing translations, required and unexpected parameters, built-in parameter types, plural values, missing formatters, and unmatched switch cases. Add a predicate under `types` when an augmented custom type also needs runtime validation in JavaScript.

## Remote synchronization

Remote synchronization is optional:

```ts
const i18n = createI18n({
  defaultLocale: 'en',
  resources,
  sync: {
    endpoint: 'https://example.com/api/i18n',
    interval: 30_000,
  },
});
```

The endpoint receives a `locale` query parameter and must return that locale's resource as JSON:

```json
{
  "common": {
    "greeting": "Hello"
  }
}
```

`loadResource(locale)` always requests a fresh remote copy. Normal translation use starts a non-blocking refresh after the configured interval has elapsed. This avoids permanent timers and keeps runtime instances safe for short-lived SSR and API requests.
