# i18n contributor instructions

## Project overview

This repository contains `@deft-plus/i18n`, a Deno 2.9+ TypeScript internationalization library published to JSR. It aims to provide type-safe translations and locale-aware message handling while remaining usable directly from TypeScript without a build step.

The project is designed around three areas described in the README:

- **Runtime:** loads translations, tracks the active locale, and exposes the main `i18n` API used by applications.
- **CLI:** compiles JSON translations into TypeScript typings and downloads self-hosted translations from the Explorer into local assets.
- **Explorer:** a self-hosted frontend and backend for viewing, creating, editing, deleting, and caching translations.

Not every planned area is implemented in this checkout. Do not invent runtime, CLI, or Explorer behavior that is not represented by source or tests. The current publishable module includes the translation text parser, which converts message syntax into structured text, parameter, plural, formatter, and switch-case parts.

The root `deno.jsonc` defines a workspace with two members:

- `module/`: the publishable `@deft-plus/i18n` package, public entry point, implementation, tests, package metadata, and package README.
- `docs/`: project documentation.

The root `README.md` is a symlink to `module/README.md`. Edit `module/README.md`; do not replace the symlink with a separate file. Files under `.agents/` and `skills-lock.json` are agent-tooling metadata, not library source.

## Commands

Run commands from the repository root.

```bash
deno ci                 # reproduce dependencies from deno.lock
deno task fmt           # format source, configuration, and Markdown
deno task lint          # lint and verify formatting
deno task check         # type-check the public entry point and tests
deno task test          # run tests and enforce 100% coverage
deno task test:u        # run tests with the suite's update argument
deno task jsdoc:lint    # validate public API documentation
deno task jsdoc:generate
deno publish --dry-run --allow-dirty
```

Before completing a code change, run `deno task lint`, `deno task check`, and `deno task test`. Run `deno task jsdoc:lint` when changing exported or protected APIs. Use a publish dry run when changing exports, package metadata, dependencies, or published files.

Do not grant `-A` to routine commands. Add only the narrowest permission required by the behavior under test.

## Source and API conventions

- `module/mod.ts` is the only public package entry point. Export intentional public APIs there; do not expose internal helpers accidentally.
- Prefix internal implementation files with `_`, as in `_api.ts`, `_logging.ts`, and `_reactive_node.ts`.
- Keep tests beside their implementation and name them `*_test.ts`.
- Use explicit `.ts` extensions for relative imports and use import-map aliases for JSR dependencies.
- Preserve strict TypeScript types. Avoid `any`, non-null assertions, unchecked casts, and broad `Function` types unless the mapping genuinely requires them and the lint suppression explains why.
- Use two-space indentation, single quotes, 100-column TypeScript formatting, and Deno's formatter. Markdown uses `proseWrap: never`.
- Begin every TypeScript source file with the exact copyright header below, followed by a descriptive module-level JSDoc block containing `@module`. Describe the file's purpose rather than repeating its filename. For test files just do the copyright header and a space after.

  ```ts
  // Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

  /**
   * Description of the file's purpose and the APIs or behavior it contains.
   *
   * @module
   */
  ```

- Give complete JSDoc to the module's main functions and any declaration that is exported or may become part of the external API. Include behavior, parameters, returns, and a realistic example when one adds useful context. Keep public signatures free of private referenced types so `deno doc --lint` succeeds.
- Order external API JSDoc content as follows: summary and details, `@example` when needed, `@template` tags, `@param` tags, and finally `@returns`.
- Give examples a short title, such as `@example Usage`, and use a fenced `ts` code block.
- Format every template tag as `@template T - Description.` and every parameter tag as `@param value - Description.`. The dash after the template or parameter name is required.
- Format return tags as `@returns Description.` without a dash after `@returns`.
- Keep JSDoc for internal functions simple and normally omit examples. Document their parameters and returns when present, then add `@internal` as the final tag, separated from `@returns` or the preceding content by one blank JSDoc line.
- Give every top-level constant a very short, single-line JSDoc comment. Mark an internal constant in that same line, for example `/** Matches parameter expressions. @internal */`.
- Document every class and interface, including each method and property. Use concise one-line JSDoc for self-explanatory members and complete external API JSDoc for members whose behavior consumers need to understand. End internal members with `@internal` following the same spacing rule.

  ````ts
  /**
   * Description...
   *
   * @example Usage
   * ```ts
   * // Example in typescript...
   * ```
   *
   * @template T - Type information...
   * @param value - Param information...
   * @returns Return information...
   */
  ````

  ```ts
  /**
   * Description...
   *
   * @param text - Param information...
   * @returns Return information...
   *
   * @internal
   */
  function remove(text: string): string {
    // Impl...
  }

  /**
   * Description...
   * @internal
   */
  const INTERNAL_CONST = 'internal';

  /** Description... */
  const PUBLIC_CONST = 'public';
  ```

## Translation parser invariants

- Preserve literal text exactly. Only syntax-bearing parameter, plural, formatter, and switch-case values are normalized or trimmed.
- Parse parameters from single braces. A parameter has a key, defaults to type `unknown`, may declare a type after `:`, and may be marked optional with `?`.
- Preserve parameter transforms in declaration order. Plain pipe-delimited transforms are formatters; brace-delimited transforms are switch-case expressions.
- Support escaped commas in switch-case values without splitting the escaped content into a new case. Restore the literal comma in the parsed value.
- Parse plurals from double braces and always produce an `other` value. Map one entry to `other`; two to `one` and `other`; three to `zero`, `one`, and `other`; and the full syntax to `zero`, `one`, `two`, `few`, `many`, and `other`.
- A plural without an explicit key may reuse the most recent numeric parameter or plural key. Throw when no valid prior key exists; never silently produce an empty plural key.
- Keep optional plural categories absent when they were not supplied. Do not remove an intentionally empty `other` value.
- When extending message syntax, add focused tests for whitespace, empty values, escaping, adjacent expressions, malformed input, and interactions with prior-key inference.

## Testing conventions

- Register every case as an independent top-level `Deno.test`. Do not use test steps or `@std/testing/bdd`.
- Use `@std/expect` for expectations and `@std/testing/mock` only when a spy or stub is needed.
- Name tests `<function-or-method>() <behavior>`, such as `parseText() should parse a typed parameter`. Always include parentheses after the callable name.
- Declare tests with `Deno.test(name, fn)` and use an arrow function for `fn`, including asynchronous cases.
- Keep tests deterministic and isolated. Do not rely on ambient locale, timezone, environment variables, network access, or filesystem state unless the behavior explicitly requires it and the test controls it.
- Assert complete parsed structures so changes to discriminants, keys, types, optionality, transforms, plural categories, and ordering are visible.
- Cover both runtime behavior and public type expectations when changing an API contract.
- For locale-sensitive behavior, specify the locale explicitly and include cases whose output genuinely differs by locale.
- For CLI behavior, use temporary fixtures and verify generated TypeScript is deterministic, formatted, and type-checkable.

## Runtime, CLI, and Explorer boundaries

- Keep the runtime focused on loading translations, selecting locales, and resolving type-safe messages. It must not depend on Explorer availability during normal application execution.
- Treat generated translation typings as build artifacts of the CLI. Generation must be deterministic for identical JSON input and must not weaken translation keys or parameter types.
- Keep local translation assets usable without network access after they have been downloaded.
- Treat Explorer data as untrusted input at its backend boundary. Validate locale identifiers, translation keys, message syntax, and persisted values before making them available to the runtime or CLI.
- Keep shared message syntax consistent across the runtime, CLI, and Explorer. Parser changes require checking every implemented producer and consumer of that syntax.

## Documentation

Update documentation in the same change as user-visible behavior:

- `module/README.md` for installation, architecture overview, and common package usage.
- The relevant page under `docs/` for detailed guides when one exists.
- Source JSDoc for API contracts and generated reference documentation.

Use `@deft-plus/i18n` in consumer examples. Keep translation syntax, API names, locale behavior, and generated-file examples synchronized with the implementation. Describe planned runtime, CLI, or Explorer features as planned rather than available until they exist in the repository.

## Package and release rules

- Keep package metadata, imports, and exports in `module/deno.jsonc`.
- Commit `deno.lock` and keep it synchronized. CI uses `deno ci` and must fail on a stale lockfile.
- Publishing targets JSR through `deno publish`; the release workflow uses OIDC provenance.
- Do not edit generated `.coverage/` or `.deno-docs/` output.
- Avoid adding production dependencies for functionality provided by Deno or the platform.
- Do not publish internal parser helpers or unfinished runtime, CLI, or Explorer APIs merely to make tests import them.
