// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

/**
 * Provides the `i18n` command-line interface for synchronizing generated project resources.
 *
 * The command discovers a shared `deft.config` file, finds its i18n plugin, downloads the complete
 * Explorer resource snapshot, and creates JSON resources plus typed runtime modules. Projects can
 * expose the installed CLI through a Deno task, keeping command execution pinned to the package
 * version selected by their configuration and lockfile.
 *
 * @example Configure a project-local command
 * ```jsonc
 * {
 *   "tasks": {
 *     "i18n": "deno --allow-read=. --allow-write=. --allow-net=example.com @deft-plus/i18n/cli"
 *   }
 * }
 * ```
 *
 * @example Synchronize the current project
 * ```sh
 * deno task i18n sync
 * ```
 *
 * @example Use a custom shared configuration path
 * ```sh
 * deno task i18n sync --config ./configuration/deft.config.mjs
 * ```
 *
 * @example Inspect the installed version
 * ```sh
 * deno task i18n --version
 * deno task i18n -v
 * ```
 *
 * @module
 */

import { Command } from '@cliffy/command';

import { synchronize } from './_cli.ts';

/**
 * Installed i18n package version.
 * @internal
 */
export const VERSION = '0.1.0';

/**
 * Runs the i18n command-line interface.
 *
 * @example Usage
 * ```ts
 * await runCli(['sync']);
 * ```
 *
 * @param args - Command-line arguments excluding the executable name.
 * @returns A promise that settles after command execution.
 */
export async function runCli(args: readonly string[] = Deno.args): Promise<void> {
  const syncCommand = new Command()
    .description('Download translations and generate typed runtime resources.')
    .option('-c, --config <path:file>', 'Path to a shared Deft+ configuration file.')
    .action(async ({ config }) => {
      const result = await synchronize({ cwd: Deno.cwd(), configPath: config });
      await Deno.stdout.write(new TextEncoder().encode(
        `Synchronized ${result.locales.length} locale(s) into ${result.outputPath}.\n`,
      ));
    });

  await new Command()
    .name('i18n')
    .description('Synchronize typed internationalization resources.')
    .version(VERSION)
    .versionOption('-v, --version', 'Show the installed version.')
    .command('sync', syncCommand)
    .parse([...args]);
}

if (import.meta.main) {
  await runCli();
}
