# Contributor instructions

<!-- ====================================================================== -->
<!-- PROJECT-SPECIFIC INSTRUCTIONS: replace or delete this entire section. -->
<!-- ====================================================================== -->

## Project: `@deft-plus/i18n`

This repository contains a Deno 2.9+ TypeScript internationalization library published to JSR. It provides type-safe translations and locale-aware message handling directly from TypeScript without a build step.

The project is designed around three areas:

- **Runtime:** loads translations, tracks the active locale, and exposes the `i18n` API used by applications.
- **CLI:** downloads Explorer resources and generates JSON translations, TypeScript declarations, and an isolated runtime factory.
- **Explorer:** will provide a self-hosted frontend and backend for managing and caching translations.

Do not invent Explorer behavior that is not represented by source or tests. The current publishable package includes the typed runtime, translation text parser, shared Deft+ configuration plugin, and synchronization CLI. The runtime loads locale resources, resolves fallbacks, renders parameters, plurals, formatters, and switch cases, validates JavaScript usage, and can synchronize resources with a remote endpoint. The CLI discovers `deft.config` files, validates full Explorer snapshots, and atomically generates typed runtime resources.

### Translation parser invariants

- Preserve literal text exactly. Normalize or trim only syntax-bearing parameter, plural, formatter, and switch-case values.
- Parse parameters from single braces. Parameters default to type `unknown`, may declare a type after `:`, and may be optional with `?`.
- Preserve parameter transforms in declaration order. Plain pipe-delimited transforms are formatters; brace-delimited transforms are switch-case expressions.
- Support escaped commas in switch-case values without creating a new case, and restore the literal comma in the parsed value.
- Parse plurals from double braces and always produce an `other` value. Map one entry to `other`; two to `one` and `other`; three to `zero`, `one`, and `other`; and the full syntax to `zero`, `one`, `two`, `few`, `many`, and `other`.
- A plural without an explicit key may reuse the most recent numeric parameter or plural key. Throw when no valid prior key exists; never produce an empty plural key silently.
- Keep optional plural categories absent when they were not supplied. Preserve an intentionally empty `other` value.
- When extending message syntax, test whitespace, empty values, escaping, adjacent expressions, malformed input, and prior-key inference interactions.

### Runtime, CLI, and Explorer boundaries

- Keep the runtime focused on loading translations, selecting locales, and resolving type-safe messages. Normal application execution must not depend on Explorer availability.
- Treat generated translation typings as deterministic CLI build artifacts. Never weaken translation keys or parameter types.
- Keep downloaded translation assets usable without network access.
- Keep shared configuration discovery centralized in `CONFIG_FILENAMES`; supported defaults are `deft.config.ts`, `.mts`, `.cts`, `.js`, `.mjs`, and `.cjs`, with explicit paths supported by the CLI.
- Keep generated artifact names stable: `resources.generated.ts`, `runtime.generated.ts`, `manifest.json`, and the `resources/` JSON directory.
- Treat Explorer data as untrusted. Validate locale identifiers, translation keys, message syntax, and persisted values at the backend boundary.
- Keep message syntax consistent across the runtime, CLI, and Explorer. Parser changes require checking every implemented producer and consumer.

### Project documentation and publishing

- Update `module/README.md` for installation, architecture, and common package usage.
- Update the relevant page under `docs/` for detailed guidance when one exists.
- Use `@deft-plus/i18n` in consumer examples.
- Describe unimplemented Runtime, CLI, or Explorer capabilities as planned rather than available.
- Keep package metadata, imports, and exports in `module/deno.jsonc`.
- Commit `deno.lock` and keep it synchronized. CI uses `deno ci` and must reject a stale lockfile.
- Publish to JSR with `deno publish`; the release workflow uses OIDC provenance.
- Do not publish internal parser helpers or unfinished APIs merely to make tests import them.

<!-- ====================================================================== -->
<!-- END PROJECT-SPECIFIC INSTRUCTIONS.                                    -->
<!-- Delete everything above this line when reusing only the conventions.  -->
<!-- ====================================================================== -->

---

<!-- ====================================================================== -->
<!-- SHARED CONVENTIONS: LOCKED                                             -->
<!-- ====================================================================== -->

# Shared project conventions

## Locked-section policy

Everything from the `SHARED CONVENTIONS: LOCKED` marker through the end of this file is immutable shared policy.

- Agents and automated tools MUST NOT edit, delete, reorder, reformat, or append content inside this locked section.
- Project-specific requirements, exceptions, paths, commands, and architecture belong only in the project-specific section above.
- A task that changes source code, tests, documentation, configuration, or the project-specific section does not authorize changing this locked section.
- Only an explicit user instruction to update the **locked shared conventions** authorizes edits here. General requests to update `AGENTS.md` are not sufficient authorization.
- When copying this policy to another project, preserve this locked section verbatim and place the new project's instructions above its start marker.

## Working principles

- Read the nearest applicable `AGENTS.md` before changing files. More deeply nested instructions may add project-specific requirements but must not weaken this locked policy.
- Inspect existing code, configuration, tests, and documentation before making assumptions.
- Keep changes scoped to the request. Preserve unrelated work and do not rewrite user changes unnecessarily.
- Prefer established project patterns over introducing a parallel convention.
- Do not invent behavior that is absent from source, tests, or project-specific requirements.
- Use informed, low-risk assumptions to continue working. Ask before making a choice that would materially change the requested result.

### Repository layout

- `module/` contains the publishable `@deft-plus/i18n` package, implementation, tests, metadata, and package README.
- `module/mod.ts` is the only public package entry point. Export only intentional public APIs there.
- `docs/` contains detailed project documentation.
- `README.md` is a symlink to `module/README.md`. Edit `module/README.md`; never replace the symlink with a separate file.
- `.agents/` and `skills-lock.json` contain agent tooling metadata, not library source.

### Project commands

Run commands from the repository root.

```bash
deno ci
deno task fmt
deno task lint
deno task check
deno task test
deno task test:u
deno task jsdoc:lint
deno task jsdoc:generate
deno publish --dry-run --allow-dirty
```

The test task enforces 100% coverage. Use the publish dry run when changing exports, package metadata, dependencies, or published files.

## Deno toolchain and verification

- Use the Deno version required by the repository. New Deno projects should use Deno 2.9 or newer.
- Prefer configured repository tasks over ad hoc commands.
- Use `deno ci` for reproducible CI installation when a lockfile is present.
- Before completing a code change, run the configured formatting, linting, type-checking, and test tasks. For the standard task names, run `deno task lint`, `deno task check`, and `deno task test`.
- Run the configured JSDoc lint task when changing exported or protected APIs.
- Run `deno publish --dry-run --allow-dirty` when changing JSR exports, package metadata, dependencies, or published files.
- If a project uses different task names, discover and run their equivalents rather than editing this shared section.
- Do not grant `-A` to routine commands. Add only the narrowest permission required by the behavior being exercised.
- Do not edit generated coverage or documentation output.

## Source and API conventions

- Keep a deliberate public entry point and export only intentional public APIs.
- Prefix genuinely internal implementation files with `_`. Give public source modules descriptive names.
- Use explicit `.ts` extensions for relative imports and configured aliases for package dependencies.
- Use only one import declaration per module specifier. When an import contains values and types, combine them with inline `type` modifiers:

  ```ts
  import { createThing, type Thing } from './mod.ts';
  ```

- A module imported exclusively for types may use `import type`.
- Preserve strict TypeScript types. Avoid `any`, non-null assertions, unchecked casts, and broad `Function` types unless they are genuinely required and a lint suppression explains why.
- Use two-space indentation, single quotes, a 100-column TypeScript line width, and Deno's formatter. Keep Markdown prose unwrapped when the repository formatter is configured that way.
- Avoid production dependencies for functionality already provided by Deno or the target platform.

## File and JSDoc conventions

- Begin every TypeScript source file with this exact copyright header:

  ```ts
  // Copyright the Deft+ authors. All rights reserved. Apache-2.0 license
  ```

- After the header, regular source files require a descriptive module-level JSDoc block containing `@module`. Explain the module's purpose, responsibilities, important exports, typical workflow, and relevant constraints in language any developer can understand. The explanation should be robust enough to understand how and why the module is used without reading its implementation, while remaining concise and avoiding unnecessary internal details. Modules that expose important user-facing behavior must include practical `@example` blocks for their primary APIs or use cases; examples are not required for every minor or internal helper. Never merely repeat the filename.

  ````ts
  // Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

  /**
   * Provides the public utilities for creating and using a typed resource.
   *
   * Use {@link createResource} to initialize the resource, then call its
   * methods to read or update values. The module validates inputs before
   * applying changes and reports invalid operations with {@link ResourceError}.
   *
   * @example Create and read a resource
   * ```ts
   * const resource = createResource({ name: 'Example' });
   * console.log(resource.get('name'));
   * ```
   *
   * @module
   */
  ````

- Test files and the mod.ts file use only the copyright header followed by a blank line; they do not require module JSDoc.
- Give complete JSDoc to main functions and declarations that are exported or may become external APIs. Include behavior, parameters, returns, and a realistic example when it adds useful context.
- Keep public signatures free of private referenced types so documentation linting succeeds.
- Order external API JSDoc as: summary and details, `@example` when useful, `@template`, `@param`, and finally `@returns`.
- Title examples, such as `@example Usage`, and use a fenced `ts` code block.
- Format template tags as `@template T - Description.` and parameter tags as `@param value - Description.`. Both require a dash after the name.
- Format return tags as `@returns Description.` with no dash after `@returns`.
- Keep internal-function JSDoc concise and normally omit examples. Document parameters and returns when present. Add `@internal` as the final tag, separated from the preceding content by one blank JSDoc line.
- Give every top-level constant a short JSDoc comment. An internal constant requires a multiline comment with its description and `@internal` on separate lines; never append `@internal` to a single-line JSDoc comment.
- Document every class and interface, including each method and property. Self-explanatory members may use concise one-line JSDoc. Consumer-facing behavior requires complete external API documentation.
- End documentation for internal class or interface members with `@internal`.

  ````ts
  /**
   * Description of the public API.
   *
   * @example Usage
   * ```ts
   * const result = createThing(value);
   * ```
   *
   * @template T - Type information.
   * @param value - Parameter information.
   * @returns Return information.
   */
  ````

  ```ts
  /**
   * Description of the internal function.
   *
   * @param text - Parameter information.
   * @returns Return information.
   *
   * @internal
   */
  function remove(text: string): string {
    // Implementation...
  }

  /**
   * Description of the internal constant.
   * @internal
   */
  const INTERNAL_CONST = 'internal';

  /** Description of the public constant. */
  const PUBLIC_CONST = 'public';
  ```

## Testing conventions

- Keep tests beside their implementation and name them `*_test.ts`.
- Register every case as an independent top-level `Deno.test`. Do not use test steps or BDD wrappers.
- Use `@std/expect` for expectations and `@std/testing/mock` only when a spy or stub is necessary.
- Name tests `<function-or-method>() <behavior>`, such as `parseText() should parse a typed parameter`. Always include parentheses after the callable name.
- Declare tests with `Deno.test(name, fn)` and use an arrow function for `fn`, including asynchronous cases.
- Keep tests deterministic and isolated. Do not depend on ambient locale, timezone, environment variables, network access, or filesystem state unless the behavior requires it and the test controls it.
- Assert complete output structures when individual fields, discriminants, ordering, or optionality are part of the contract.
- Cover runtime behavior and public compile-time expectations when changing a typed API.
- For locale-sensitive behavior, set the locale explicitly and test output that genuinely differs by locale.
- For generated output, use temporary fixtures and verify that results are deterministic, formatted, and type-checkable.
- Add regression tests for every corrected bug and focused boundary tests for new syntax or behavior.

## Documentation and release hygiene

- Update user documentation in the same change as user-visible behavior.
- Keep examples, API names, configuration, and observed behavior synchronized with the implementation.
- Update source JSDoc whenever an API contract changes.
- Describe planned features as planned until they are implemented and tested.
- Keep lockfiles synchronized and committed when the project tracks them.
- Never publish internal helpers or unfinished APIs solely for test convenience.
- Before handing off a change, report the verification performed and any checks that could not be run.

<!-- ====================================================================== -->
<!-- END SHARED CONVENTIONS: LOCKED                                         -->
<!-- ====================================================================== -->
