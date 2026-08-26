// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

import { expect } from '@std/expect';
import { basename, join, toFileUrl } from '@std/path';
import { stub } from '@std/testing/mock';

import { CONFIG_FILENAMES, findConfigPath, I18nCliError, synchronize } from './_cli.ts';

/** Creates a JavaScript shared project configuration fixture. */
function projectConfig(options = ''): string {
  return `export default {
  plugins: [{
    name: '@deft-plus/i18n',
    options: {
      defaultLocale: 'en',
      output: './.translations',
      sync: { endpoint: 'https://example.com/api/i18n', interval: 60000 },
      formatters: { currency: (value) => String(value) },
      types: { userId: (value) => typeof value === 'number' },
      ${options}
    },
  }],
};
`;
}

/** Creates a successful synchronization response fixture. */
function successfulFetch(resources: unknown): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify({ resources }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
}

Deno.test('findConfigPath() should discover supported files from a child directory', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    const child = join(directory, 'one', 'two');
    await Deno.mkdir(child, { recursive: true });
    await Deno.writeTextFile(join(directory, 'deft.config.mjs'), projectConfig());

    expect(await findConfigPath(child)).toBe(join(directory, 'deft.config.mjs'));
    expect(CONFIG_FILENAMES).toContain('deft.config.ts');
    expect(CONFIG_FILENAMES).toContain('deft.config.cts');
    expect(CONFIG_FILENAMES).toContain('deft.config.js');
    expect(CONFIG_FILENAMES).toContain('deft.config.cjs');
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('findConfigPath() should resolve an explicit relative file', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    const configPath = join(directory, 'custom.mjs');
    await Deno.writeTextFile(configPath, projectConfig());

    expect(await findConfigPath(directory, './custom.mjs')).toBe(configPath);
    expect(await findConfigPath(directory, configPath)).toBe(configPath);
    await expect(findConfigPath(directory, './missing.ts')).rejects.toThrow('does not exist');
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('findConfigPath() should reject a project without configuration', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    await expect(findConfigPath(directory)).rejects.toThrow(I18nCliError);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('synchronize() should generate resources, declarations, and a runtime factory', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    const configPath = join(directory, 'deft.config.mjs');
    const oldOutput = join(directory, '.translations');
    await Deno.writeTextFile(configPath, projectConfig("fallbacks: { es: ['en'] },"));
    await Deno.mkdir(oldOutput);
    await Deno.writeTextFile(join(oldOutput, 'old.txt'), 'old');

    const result = await synchronize({
      cwd: directory,
      fetch: successfulFetch({
        es: { common: { greeting: 'Hola {name:userId}' } },
        en: {
          common: {
            price: 'Price: {amount:number|currency}',
            greeting: 'Hello {name:userId}',
          },
        },
      }),
    });

    expect(result.configPath).toBe(configPath);
    expect(result.outputPath).toBe(oldOutput);
    expect(result.locales).toEqual(['en', 'es']);
    expect(await Deno.readTextFile(join(oldOutput, 'resources', 'en.json'))).toBe(
      `{
  "common": {
    "greeting": "Hello {name:userId}",
    "price": "Price: {amount:number|currency}"
  }
}
`,
    );
    await expect(Deno.stat(join(oldOutput, 'old.txt'))).rejects.toThrow(Deno.errors.NotFound);

    const generatedResources = await Deno.readTextFile(
      join(oldOutput, 'resources.generated.ts'),
    );
    expect(generatedResources).toContain("import resource0 from './resources/en.json'");
    expect(generatedResources).toContain('interface Translation');
    expect(generatedResources).toContain("'greeting': 'Hello {name:userId}';");
    expect(generatedResources).toContain("'userId': ConfiguredTypes['userId'];");

    const generatedRuntime = await Deno.readTextFile(join(oldOutput, 'runtime.generated.ts'));
    expect(generatedRuntime).toContain("import projectConfig from '../deft.config.mjs';");
    expect(generatedRuntime).toContain('export function createI18n()');
    expect(generatedRuntime).toContain('return createRuntime({ ...options, resources });');

    expect(JSON.parse(await Deno.readTextFile(join(oldOutput, 'manifest.json')))).toEqual({
      version: 1,
      defaultLocale: 'en',
      locales: ['en', 'es'],
    });
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('synchronize() should generate a resource without custom types', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    await Deno.writeTextFile(
      join(directory, 'deft.config.mjs'),
      projectConfig('types: undefined,'),
    );
    await synchronize({
      cwd: directory,
      fetch: successfulFetch({ en: { common: { greeting: 'Hello' } } }),
    });

    const generated = await Deno.readTextFile(
      join(directory, '.translations', 'resources.generated.ts'),
    );
    expect(generated).not.toContain('interface CustomTypes');
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('createI18n() should run from generated resources and shared TypeScript config', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    await Deno.writeTextFile(
      join(directory, 'deft.config.ts'),
      `import { i18n } from '@deft-plus/i18n/config';

export default {
  plugins: [i18n({
    defaultLocale: 'en',
    sync: { endpoint: 'https://example.com/api/i18n', interval: 60000 },
    types: {
      userId: (value: unknown): value is number => typeof value === 'number',
    },
  })],
};
`,
    );
    await synchronize({
      cwd: directory,
      fetch: successfulFetch({ en: { common: { greeting: 'Hello {name:userId}' } } }),
    });

    const runtimeModule = await import(
      `${
        toFileUrl(join(directory, '.translations', 'runtime.generated.ts')).href
      }?test=${crypto.randomUUID()}`
    );
    const runtime = runtimeModule.createI18n();

    expect(runtime.namespace('common').greeting({ name: 42 })).toBe('Hello 42');
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('synchronize() should reject unsuccessful responses', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    await Deno.writeTextFile(join(directory, 'deft.config.mjs'), projectConfig());
    const fetcher: typeof fetch = () =>
      Promise.resolve(new Response(null, { status: 503, statusText: 'Unavailable' }));

    await expect(synchronize({ cwd: directory, fetch: fetcher })).rejects.toThrow(
      '503 Unavailable',
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('synchronize() should validate the synchronization envelope and default locale', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    await Deno.writeTextFile(join(directory, 'deft.config.mjs'), projectConfig());

    await expect(synchronize({ cwd: directory, fetch: successfulFetch(undefined) })).rejects
      .toThrow('resources object');
    await expect(
      synchronize({
        cwd: directory,
        fetch: successfulFetch({ es: { common: { greeting: 'Hola' } } }),
      }),
    ).rejects.toThrow('default locale "en" is missing');
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('synchronize() should reject invalid resources and messages', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    await Deno.writeTextFile(join(directory, 'deft.config.mjs'), projectConfig());
    const invalidResources: unknown[] = [
      { 'bad/locale': {} },
      { en: null },
      { en: { common: null } },
      { en: { common: { greeting: 42 } } },
      { en: { common: { greeting: 'Hello {' } } },
      { en: { common: { greeting: 'Hello {name:missing}' } } },
      { en: { common: { greeting: 'Hello {name:string|missing}' } } },
    ];
    const messages = [
      'cannot be used as a resource filename',
      'must be an object',
      'must be an object',
      'must be a string',
      'is invalid',
      'un-configured type',
      'un-configured formatter',
    ];

    for (let index = 0; index < invalidResources.length; index += 1) {
      await expect(
        synchronize({ cwd: directory, fetch: successfulFetch(invalidResources[index]) }),
      ).rejects.toThrow(messages[index]);
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('synchronize() should reject fallback references to unknown locales', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    const resources = { en: { common: { greeting: 'Hello' } } };
    await Deno.writeTextFile(
      join(directory, 'deft.config.mjs'),
      projectConfig("fallbacks: { es: ['en'] },"),
    );
    await expect(synchronize({ cwd: directory, fetch: successfulFetch(resources) })).rejects
      .toThrow('unknown locale "es"');

    await Deno.writeTextFile(
      join(directory, 'deft.config.mjs'),
      projectConfig("fallbacks: { default: ['fr'] },"),
    );
    await expect(synchronize({ cwd: directory, fetch: successfulFetch(resources) })).rejects
      .toThrow('unknown locale "fr"');
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('synchronize() should use global fetch and tolerate undefined fallback entries', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    await Deno.writeTextFile(
      join(directory, 'deft.config.mjs'),
      projectConfig('fallbacks: { default: undefined },'),
    );
    using fetchStub = stub(
      globalThis,
      'fetch',
      successfulFetch({ en: { common: { greeting: 'Hello' } } }),
    );

    const result = await synchronize({ cwd: directory });

    expect(result.locales).toEqual(['en']);
    expect(fetchStub.calls).toHaveLength(1);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('synchronize() should validate missing type and formatter registries', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    await Deno.writeTextFile(
      join(directory, 'deft.config.mjs'),
      projectConfig('types: undefined, formatters: undefined,'),
    );
    await expect(
      synchronize({
        cwd: directory,
        fetch: successfulFetch({ en: { common: { value: '{value:missing}' } } }),
      }),
    ).rejects.toThrow('un-configured type');
    await expect(
      synchronize({
        cwd: directory,
        fetch: successfulFetch({ en: { common: { value: '{value:string|missing}' } } }),
      }),
    ).rejects.toThrow('un-configured formatter');
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('synchronize() should clean temporary output after a write failure', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    await Deno.writeTextFile(join(directory, 'deft.config.mjs'), projectConfig());
    using writeStub = stub(
      Deno,
      'writeTextFile',
      () => Promise.reject(new Error('write failed')),
    );

    await expect(
      synchronize({
        cwd: directory,
        fetch: successfulFetch({ en: { common: { greeting: 'Hello' } } }),
      }),
    ).rejects.toThrow('write failed');
    expect(writeStub.calls.length).toBeGreaterThan(0);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('synchronize() should restore existing output after replacement fails', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    const output = join(directory, '.translations');
    await Deno.writeTextFile(join(directory, 'deft.config.mjs'), projectConfig());
    await Deno.mkdir(output);
    await Deno.writeTextFile(join(output, 'preserved.txt'), 'preserved');
    const rename = Deno.rename.bind(Deno);
    let calls = 0;
    using renameStub = stub(Deno, 'rename', async (oldPath, newPath) => {
      calls += 1;
      if (calls === 2) {
        throw new Error('rename failed');
      }
      await rename(oldPath, newPath);
    });

    await expect(
      synchronize({
        cwd: directory,
        fetch: successfulFetch({ en: { common: { greeting: 'Hello' } } }),
      }),
    ).rejects.toThrow('rename failed');
    expect(await Deno.readTextFile(join(output, 'preserved.txt'))).toBe('preserved');
    expect(renameStub.calls).toHaveLength(3);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('findConfigPath() should propagate unexpected filesystem errors', async () => {
  const failure = new Error('stat failed');
  using statStub = stub(Deno, 'stat', () => Promise.reject(failure));

  await expect(findConfigPath(Deno.cwd(), './deft.config.ts')).rejects.toBe(failure);
  expect(statStub.calls).toHaveLength(1);
});

Deno.test('synchronize() should propagate unexpected output inspection errors', async () => {
  const directory = await Deno.makeTempDir({ dir: Deno.cwd(), prefix: '.i18n-test-' });

  try {
    const configPath = join(directory, 'deft.config.mjs');
    const outputPath = join(directory, '.translations');
    await Deno.writeTextFile(configPath, projectConfig());
    const stat = Deno.stat.bind(Deno);
    using statStub = stub(Deno, 'stat', (path) => {
      if (String(path) === outputPath) {
        return Promise.reject(new Error('inspection failed'));
      }
      return stat(path);
    });

    await expect(
      synchronize({
        cwd: directory,
        configPath,
        fetch: successfulFetch({ en: { common: { greeting: 'Hello' } } }),
      }),
    ).rejects.toThrow('inspection failed');
    expect(statStub.calls.length).toBeGreaterThan(1);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test('findConfigPath() should prioritize TypeScript configuration', () => {
  expect(basename(CONFIG_FILENAMES[0])).toBe('deft.config.ts');
  expect(CONFIG_FILENAMES).toEqual([
    'deft.config.ts',
    'deft.config.mts',
    'deft.config.cts',
    'deft.config.js',
    'deft.config.mjs',
    'deft.config.cjs',
  ]);
});
