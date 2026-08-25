// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

import { expect } from '@std/expect';

import {
  type CreateI18nOptions,
  type I18n,
  I18nError,
  type Resource,
  type ResourceLoader,
  type TranslationFunction,
} from '@deft-plus/i18n';
import type { MessageParameters } from './runtime_api.ts';

declare module '@deft-plus/i18n' {
  interface CustomTypes {
    runtimeTypeId: number;
  }
}

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true
  : false;

type Expect<Value extends true> = Value;

type _RequiredParameter = Expect<
  Equal<MessageParameters<'Hello {name:number}'>, { name: number }>
>;
type _OptionalParameter = Expect<
  Equal<MessageParameters<'Hello {name?:string}'>, { name?: string }>
>;
type _MinimalRuntime = Expect<
  Equal<keyof I18n<'en'>, 'locale' | 'namespace' | 'loadResource' | 'setLocale'>
>;

function verifyRuntimeTypes(): void {
  const requiredTranslation: TranslationFunction<'Hello {name:runtimeTypeId}'> = ({ name }) =>
    String(name);
  const optionalTranslation: TranslationFunction<'Hello {name?:string}'> = (parameters) =>
    parameters?.name ?? 'Hello';
  const parameterlessTranslation: TranslationFunction<'Hello'> = () => 'Hello';
  const resourceLoader: ResourceLoader = () =>
    Promise.resolve({ default: { common: { greeting: 'Hello' } } });
  const options: CreateI18nOptions<{ en: Resource }> = {
    defaultLocale: 'en',
    resources: { en: { common: { greeting: 'Hello' } } },
  };

  requiredTranslation({ name: 42 });
  optionalTranslation();
  optionalTranslation({ name: 'Ada' });
  parameterlessTranslation();
  void resourceLoader;
  void options;

  // @ts-expect-error Custom parameter types must reject incompatible values.
  requiredTranslation({ name: '42' });
  // @ts-expect-error Required translation parameters cannot be omitted.
  requiredTranslation();
  // @ts-expect-error Parameterless translations do not accept parameters.
  parameterlessTranslation({});
}

void verifyRuntimeTypes;

Deno.test('I18nError() should create a named runtime error', () => {
  const error = new I18nError('Unable to render translation');

  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('I18nError');
  expect(error.message).toBe('Unable to render translation');
});
