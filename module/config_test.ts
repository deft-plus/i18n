// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

import { expect } from '@std/expect';

import {
  getI18nPlugin,
  i18n,
  I18N_PLUGIN_NAME,
  I18nConfigError,
  type InferI18nTypes,
} from './config.ts';

const plugin = i18n({
  defaultLocale: 'en',
  sync: { endpoint: 'https://example.com/api/i18n', interval: 60_000 },
  types: {
    userId: (value: unknown): value is number => typeof value === 'number',
  },
});

type ConfiguredTypes = InferI18nTypes<typeof plugin>;
const userId: ConfiguredTypes['userId'] = 42;
void userId;

Deno.test('i18n() should preserve a typed plugin configuration', () => {
  expect(plugin.name).toBe(I18N_PLUGIN_NAME);
  expect(plugin.options.defaultLocale).toBe('en');
  expect(Object.isFrozen(plugin)).toBe(true);
});

Deno.test('i18n() should reject invalid plugin options', () => {
  expect(() => i18n({ defaultLocale: '', sync: { endpoint: 'invalid', interval: -1 } })).toThrow(
    I18nConfigError,
  );
  expect(() =>
    i18n({
      defaultLocale: 'en',
      sync: { endpoint: 'invalid', interval: 0 },
    })
  ).toThrow('absolute URL');
  expect(() =>
    i18n({
      defaultLocale: 'en',
      sync: { endpoint: 'https://example.com/api/i18n', interval: -1 },
    })
  ).toThrow('non-negative');
});

Deno.test('getI18nPlugin() should find one plugin in a shared configuration', () => {
  expect(getI18nPlugin({ plugins: [{ name: 'another', options: {} }, plugin] })).toBe(plugin);
});

Deno.test('getI18nPlugin() should reject invalid shared configurations', () => {
  expect(() => getI18nPlugin(null)).toThrow('plugins array');
  expect(() => getI18nPlugin({ plugins: [] })).toThrow('does not configure');
  expect(() => getI18nPlugin({ plugins: [plugin, plugin] })).toThrow('more than once');
  expect(() =>
    getI18nPlugin({
      plugins: [{ name: I18N_PLUGIN_NAME, options: { defaultLocale: 'en' } }],
    })
  ).toThrow('sync endpoint');
  expect(() => getI18nPlugin({ plugins: [{ name: I18N_PLUGIN_NAME, options: null }] })).toThrow(
    'must be an object',
  );
  expect(() =>
    getI18nPlugin({
      plugins: [{
        name: I18N_PLUGIN_NAME,
        options: {
          defaultLocale: 'en',
          output: '',
          sync: { endpoint: 'https://example.com/api/i18n', interval: 0 },
        },
      }],
    })
  ).toThrow('output must be a non-empty string');
});
