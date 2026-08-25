// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

import { expect } from '@std/expect';

import { parseText, TextParseError } from './mod.ts';

Deno.test('parseText() should parse simple text', () => {
  const parsedText = parseText('Hello World');
  expect(parsedText).toStrictEqual([{
    kind: 'text',
    content: 'Hello World',
  }]);
});

Deno.test('parseText() should parse a parameter without a type', () => {
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

Deno.test('parseText() should parse a parameter with a type', () => {
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

Deno.test('parseText() should parse parameters with and without types', () => {
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

Deno.test('parseText() should parse a parameter with whitespace', () => {
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

Deno.test('parseText() should parse an optional parameter', () => {
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

Deno.test('parseText() should parse a simple plural', () => {
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

Deno.test('parseText() should use the previous number parameter as a plural key', () => {
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

Deno.test('parseText() should throw when parsing a plural without a key', () => {
  expect(() => parseText('Test{{s}}')).toThrow();
  expect(() => parseText('{name:string} Test{{s}}')).toThrow();
});

Deno.test('parseText() should parse a singular-only plural', () => {
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

Deno.test('parseText() should parse zero-one-other plural forms', () => {
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

Deno.test('parseText() should use the previous plural key with full plural syntax', () => {
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

Deno.test('parseText() should use the previous parameter key with full plural syntax', () => {
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

Deno.test('parseText() should parse a parameter with a formatter', () => {
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

Deno.test('parseText() should parse a parameter with multiple formatters', () => {
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

Deno.test('parseText() should parse multiple parameters and formatters', () => {
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

Deno.test('parseText() should parse a switch-case statement', () => {
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

Deno.test('parseText() should parse escaped commas in a switch-case statement', () => {
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

Deno.test('parseText() should preserve colons in plural and switch-case values', () => {
  expect(parseText('{{count:value:with:colons}}')).toStrictEqual([{
    kind: 'plural',
    key: 'count',
    other: 'value:with:colons',
  }]);

  expect(parseText('{choice|{ link: https://example.com, time: 10:30 }}')).toStrictEqual([{
    kind: 'parameter',
    key: 'choice',
    type: 'unknown',
    optional: false,
    transforms: [{
      kind: 'switch-case',
      raw: '{ link: https://example.com, time: 10:30 }',
      cases: [
        { key: 'link', value: 'https://example.com' },
        { key: 'time', value: '10:30' },
      ],
    }],
  }]);
});

Deno.test('parseText() should parse escaped grammar delimiters in values', () => {
  expect(parseText('{{count:one\\|item}}')).toStrictEqual([{
    kind: 'plural',
    key: 'count',
    other: 'one|item',
  }]);

  expect(parseText('{choice|{ yes: value\\:detail\\, continued }}')).toStrictEqual([{
    kind: 'parameter',
    key: 'choice',
    type: 'unknown',
    optional: false,
    transforms: [{
      kind: 'switch-case',
      raw: '{ yes: value\\:detail\\, continued }',
      cases: [{ key: 'yes', value: 'value:detail, continued' }],
    }],
  }]);

  expect(parseText('{parameter\\:key}')).toStrictEqual([{
    kind: 'parameter',
    key: 'parameter:key',
    type: 'unknown',
    optional: false,
    transforms: [],
  }]);
});

Deno.test('parseText() should throw for unsupported plural variant counts', () => {
  for (
    const text of [
      '{{count:a|b|c|d}}',
      '{{count:a|b|c|d|e}}',
      '{{count:a|b|c|d|e|f|g}}',
    ]
  ) {
    expect(() => parseText(text)).toThrow(TextParseError);
    expect(() => parseText(text)).toThrow('1, 2, 3, or 6 variants');
  }
});

Deno.test('parseText() should throw for unbalanced expressions', () => {
  expect(() => parseText('Hello {name')).toThrow(TextParseError);
  expect(() => parseText('Hello name}')).toThrow('Unexpected closing brace');
  expect(() => parseText('{{count:one}')).toThrow('Unclosed expression');
});

Deno.test('parseText() should throw for invalid parameter declarations', () => {
  for (const text of ['{}', '{name:}', '{name?invalid}', '{name|}', '{name|{yes: value}']) {
    expect(() => parseText(text)).toThrow(TextParseError);
  }
});

Deno.test('parseText() should throw for invalid switch cases', () => {
  for (const text of ['{choice|{}}', '{choice|{missingValue}}', '{choice|{: value}}']) {
    expect(() => parseText(text)).toThrow(TextParseError);
  }
});

Deno.test('TextParseError() should expose its source position', () => {
  try {
    parseText('Hello }');
    throw new Error('Expected parseText() to throw.');
  } catch (error) {
    expect(error).toBeInstanceOf(TextParseError);

    if (error instanceof TextParseError) {
      expect(error.position).toBe(6);
      expect(error.message).toContain('position 6');
    }
  }
});
