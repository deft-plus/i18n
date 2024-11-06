// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

import { describe as group, test } from '@std/testing/bdd';
import { expect } from '@std/expect';

import { parseText } from './parser.ts';

group('parseText()', () => {
  test('should parse a simple text', () => {
    const parsedText = parseText('Hello World');
    expect(parsedText).toStrictEqual([{
      kind: 'text',
      content: 'Hello World',
    }]);
  });

  test('should parse a parameter without type', () => {
    const parsedText = parseText('Hello {name}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'text',
        content: 'Hello ',
      },
      {
        kind: 'parameter',
        key: 'name',
        type: 'unknown',
        optional: false,
        transforms: [],
      },
    ]);
  });

  test('should parse a parameter with type', () => {
    const parsedText = parseText('Hello {name:string}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'text',
        content: 'Hello ',
      },
      {
        kind: 'parameter',
        key: 'name',
        type: 'string',
        optional: false,
        transforms: [],
      },
    ]);
  });

  test('should parse a mixed parameter (with and without type)', () => {
    const parsedText = parseText('{name} and {otherName:string} are here!');
    expect(parsedText).toStrictEqual([
      {
        kind: 'parameter',
        key: 'name',
        type: 'unknown',
        optional: false,
        transforms: [],
      },
      {
        kind: 'text',
        content: ' and ',
      },
      {
        kind: 'parameter',
        key: 'otherName',
        type: 'string',
        optional: false,
        transforms: [],
      },
      {
        kind: 'text',
        content: ' are here!',
      },
    ]);
  });

  test('should parse a parameter with whitespace', () => {
    const parsedText = parseText('Hello { name : string }');
    expect(parsedText).toStrictEqual([
      {
        kind: 'text',
        content: 'Hello ',
      },
      {
        kind: 'parameter',
        key: 'name',
        type: 'string',
        optional: false,
        transforms: [],
      },
    ]);
  });

  test('should parse a optional parameter', () => {
    const parsedText = parseText('Hello { name?:string }');
    expect(parsedText).toStrictEqual([
      {
        kind: 'text',
        content: 'Hello ',
      },
      {
        kind: 'parameter',
        key: 'name',
        type: 'string',
        optional: true,
        transforms: [],
      },
    ]);
  });

  test('should parse simple plural', () => {
    const parsedText = parseText('Test{{count:s}}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'text',
        content: 'Test',
      },
      {
        kind: 'plural',
        key: 'count',
        other: 's',
      },
    ]);
  });

  test('should parse plural where the key is the previous number parameter', () => {
    const parsedText = parseText('{count:number} Test{{s}}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'parameter',
        key: 'count',
        type: 'number',
        optional: false,
        transforms: [],
      },
      {
        kind: 'text',
        content: ' Test',
      },
      {
        kind: 'plural',
        key: 'count',
        other: 's',
      },
    ]);
  });

  test('should throw trying to parse a plural without a key', () => {
    expect(() => parseText('Test{{s}}')).toThrow();
    expect(() => parseText('{name:string} Test{{s}}')).toThrow();
  });

  test('should parse plural singular-only', () => {
    /* spell-checker: disable */
    const parsedText = parseText('{count:number} weitere{{s|}} Mitglied{{er}}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'parameter',
        key: 'count',
        type: 'number',
        optional: false,
        transforms: [],
      },
      {
        kind: 'text',
        content: ' weitere',
      },
      {
        kind: 'plural',
        key: 'count',
        one: 's',
        other: '',
      },
      {
        kind: 'text',
        content: ' Mitglied',
      },
      {
        kind: 'plural',
        key: 'count',
        other: 'er',
      },
    ]);
    /* spell-checker: enable */
  });

  test('should parse plural zero-one-other', () => {
    const parsedText = parseText('The list includes {{ count : no items | an item | ?? items }}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'text',
        content: 'The list includes ',
      },
      {
        kind: 'plural',
        key: 'count',
        zero: 'no items',
        one: 'an item',
        other: '?? items',
      },
    ]);
  });

  test('should parse plural full syntax and use the key from the previos plural', () => {
    const parsedText = parseText('I have {{count:zero|one|two|a few|many|a lot}} apple{{s}}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'text',
        content: 'I have ',
      },
      {
        kind: 'plural',
        key: 'count',
        zero: 'zero',
        one: 'one',
        two: 'two',
        few: 'a few',
        many: 'many',
        other: 'a lot',
      },
      {
        kind: 'text',
        content: ' apple',
      },
      {
        kind: 'plural',
        key: 'count',
        other: 's',
      },
    ]);
  });

  test('should parse plural full syntax and use the key from the previos parameter', () => {
    const parsedText = parseText('{{prev:0 apples|1 apple|?? apples}} / {count:number} apple{{s}}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'plural',
        key: 'prev',
        zero: '0 apples',
        one: '1 apple',
        other: '?? apples',
      },
      {
        kind: 'text',
        content: ' / ',
      },
      {
        kind: 'parameter',
        key: 'count',
        type: 'number',
        optional: false,
        transforms: [],
      },
      {
        kind: 'text',
        content: ' apple',
      },
      {
        kind: 'plural',
        key: 'count',
        other: 's',
      },
    ]);
  });

  test('should parse parameter with formatter', () => {
    const parsedText = parseText('Hello {name:string|uppercase}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'text',
        content: 'Hello ',
      },
      {
        kind: 'parameter',
        key: 'name',
        type: 'string',
        optional: false,
        transforms: [
          {
            kind: 'formatter',
            name: 'uppercase',
          },
        ],
      },
    ]);
  });

  test('should parse parameter with multiple formatters', () => {
    const parsedText = parseText('Hello {name:string|uppercase|lowercase}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'text',
        content: 'Hello ',
      },
      {
        kind: 'parameter',
        key: 'name',
        type: 'string',
        optional: false,
        transforms: [
          {
            kind: 'formatter',
            name: 'uppercase',
          },
          {
            kind: 'formatter',
            name: 'lowercase',
          },
        ],
      },
    ]);
  });

  test('should parse multiple parameters and formatters', () => {
    const parsedText = parseText('Hi {name: string | upper}, today is: {date: Date | dateTime}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'text',
        content: 'Hi ',
      },
      {
        kind: 'parameter',
        key: 'name',
        type: 'string',
        optional: false,
        transforms: [
          {
            kind: 'formatter',
            name: 'upper',
          },
        ],
      },
      {
        kind: 'text',
        content: ', today is: ',
      },
      {
        kind: 'parameter',
        key: 'date',
        type: 'Date',
        optional: false,
        transforms: [
          {
            kind: 'formatter',
            name: 'dateTime',
          },
        ],
      },
    ]);
  });

  test('should parse switch-case statement', () => {
    const parsedText = parseText('{choice|{ male: his, female: her, *: their }}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'parameter',
        key: 'choice',
        type: 'unknown',
        optional: false,
        transforms: [
          {
            kind: 'switch-case',
            raw: '{ male: his, female: her, *: their }',
            cases: [
              {
                key: 'male',
                value: 'his',
              },
              {
                key: 'female',
                value: 'her',
              },
              {
                key: '*',
                value: 'their',
              },
            ],
          },
        ],
      },
    ]);
  });

  test('should parse switch-case statement allowing escape commas', () => {
    const parsedText = parseText('{choice|{ yes: I was indeed\\, a cool person , no: I was not }}');
    expect(parsedText).toStrictEqual([
      {
        kind: 'parameter',
        key: 'choice',
        type: 'unknown',
        optional: false,
        transforms: [
          {
            kind: 'switch-case',
            raw: '{ yes: I was indeed\\, a cool person , no: I was not }',
            cases: [
              {
                key: 'yes',
                value: 'I was indeed, a cool person',
              },
              {
                key: 'no',
                value: 'I was not',
              },
            ],
          },
        ],
      },
    ]);
  });
});
