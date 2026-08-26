// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

/**
 * Parses translation messages into structured text, parameter, plural, and transform parts.
 *
 * @module
 */

/**
 * Delimiters that may be escaped inside translation expressions.
 * @internal
 */
const ESCAPABLE_DELIMITER = /\\([\\,:|{}])/g;

/**
 * Supported plural variant counts.
 * @internal
 */
const PLURAL_VARIANT_COUNTS = new Set([1, 2, 3, 6]);

/** A syntax error found while parsing a translation message. */
export class TextParseError extends SyntaxError {
  /** The zero-based source position where parsing failed. */
  readonly position: number;

  /**
   * Creates a translation text parsing error.
   *
   * @param message - Description of the invalid syntax.
   * @param position - Zero-based source position where parsing failed.
   */
  constructor(message: string, position: number) {
    super(`${message} at position ${position}.`);
    this.name = 'TextParseError';
    this.position = position;
  }
}

/**
 * Parses a translation message into structured parts.
 *
 * Parameters use single braces, such as `{name:string}`, while plurals use double braces, such as
 * `{{count:no items|one item|many items}}`. A backslash escapes grammar delimiters inside values.
 * Invalid message syntax throws a {@link TextParseError}.
 *
 * @example Usage
 * ```ts
 * const message = parseText('Hello {name:string}');
 * // [{ kind: 'text', content: 'Hello ' }, { kind: 'parameter', ... }]
 * ```
 *
 * @param rawText - Translation message to parse.
 * @returns The ordered text, parameter, and plural parts found in the message.
 */
export function parseText(rawText: string): ParsedMessage {
  const message: ParsedMessage = [];
  let lastPluralKey = '';
  let textStart = 0;
  let cursor = 0;

  while (cursor < rawText.length) {
    const character = rawText[cursor];

    if (character === '}' && !isEscaped(rawText, cursor)) {
      throw new TextParseError('Unexpected closing brace', cursor);
    }

    if (character !== '{' || isEscaped(rawText, cursor)) {
      cursor += 1;
      continue;
    }

    if (textStart < cursor) {
      message.push({ kind: 'text', content: rawText.slice(textStart, cursor) });
    }

    const expression = readExpression(rawText, cursor);

    if (expression.plural) {
      const plural = parsePluralPart(expression.content, lastPluralKey, cursor);
      message.push(plural);
      lastPluralKey = plural.key;
    } else {
      const parameter = parseParameterPart(expression.content, cursor);
      message.push(parameter);

      if (parameter.type === 'number') {
        lastPluralKey = parameter.key;
      }
    }

    cursor = expression.end;
    textStart = cursor;
  }

  if (textStart < rawText.length) {
    message.push({ kind: 'text', content: rawText.slice(textStart) });
  }

  return message;
}

/**
 * Reads one balanced parameter or plural expression.
 *
 * @param text - Complete translation message.
 * @param start - Position of the expression's opening brace.
 * @returns The expression content, end position, and kind.
 *
 * @internal
 */
function readExpression(text: string, start: number): ParsedExpression {
  const plural = text[start + 1] === '{';
  const openingLength = plural ? 2 : 1;
  let depth = openingLength;

  for (let cursor = start + openingLength; cursor < text.length; cursor += 1) {
    if (isEscaped(text, cursor)) {
      continue;
    }

    if (text[cursor] === '{') {
      depth += 1;
    } else if (text[cursor] === '}') {
      depth -= 1;
    }

    if (depth === 0) {
      const contentEnd = cursor - openingLength + 1;
      return {
        content: text.slice(start + openingLength, contentEnd),
        end: cursor + 1,
        plural,
      };
    }
  }

  throw new TextParseError('Unclosed expression', start);
}

/**
 * Parses a parameter and its transforms.
 *
 * @param content - Parameter content without its outer braces.
 * @param position - Parameter position in the complete message.
 * @returns The parsed parameter.
 *
 * @internal
 */
function parseParameterPart(content: string, position: number): ParameterPart {
  const [declaration = '', ...rawTransforms] = splitSyntax(content, '|');
  const [rawKey = '', rawType] = splitFirstSyntax(declaration, ':');
  const optional = rawKey.trim().endsWith('?');
  const key = unescapeSyntax(optional ? rawKey.trim().slice(0, -1) : rawKey.trim());

  if (!key || key.includes('?')) {
    throw new TextParseError('Invalid parameter key', position);
  }

  const type = rawType === undefined ? 'unknown' : unescapeSyntax(rawType.trim());

  if (!type) {
    throw new TextParseError('Parameter type cannot be empty', position);
  }

  const transforms = rawTransforms.map((rawTransform): TransformParameterPart => {
    const transform = rawTransform.trim();

    if (!transform) {
      throw new TextParseError('Parameter transform cannot be empty', position);
    }

    if (transform.startsWith('{')) {
      return {
        kind: 'switch-case',
        cases: parseSwitchCases(transform.slice(1, -1), position),
        raw: transform,
      };
    }

    return {
      kind: 'formatter',
      name: unescapeSyntax(transform),
    };
  });

  return { kind: 'parameter', key, type, optional, transforms };
}

/**
 * Parses the mappings inside a switch-case transform.
 *
 * @param content - Switch-case content without its outer braces.
 * @param position - Transform position in the complete message.
 * @returns The parsed switch cases.
 *
 * @internal
 */
function parseSwitchCases(content: string, position: number): SwitchCase[] {
  const rawCases = splitSyntax(content, ',');

  if (rawCases.length === 1 && !rawCases[0]?.trim()) {
    throw new TextParseError('Switch-case transform cannot be empty', position);
  }

  return rawCases.map((rawCase): SwitchCase => {
    const [rawKey, rawValue] = splitFirstSyntax(rawCase, ':');
    const key = unescapeSyntax(rawKey.trim());

    if (rawValue === undefined || !key) {
      throw new TextParseError('Invalid switch case', position);
    }

    return {
      key,
      value: unescapeSyntax(rawValue.trim()),
    };
  });
}

/**
 * Parses a plural expression and validates its variant count.
 *
 * @param content - Plural content without its outer braces.
 * @param previousKey - Previous numeric parameter or plural key.
 * @param position - Plural position in the complete message.
 * @returns The parsed plural variants.
 *
 * @internal
 */
function parsePluralPart(content: string, previousKey: string, position: number): PluralPart {
  const [rawKeyOrValues, explicitValues] = splitFirstSyntax(content, ':');
  const key = unescapeSyntax((explicitValues === undefined ? previousKey : rawKeyOrValues).trim());
  const rawValues = explicitValues ?? rawKeyOrValues;

  if (!key) {
    throw new TextParseError('Plural key is not provided', position);
  }

  const values = splitSyntax(rawValues, '|').map((value) => unescapeSyntax(value.trim()));

  if (!PLURAL_VARIANT_COUNTS.has(values.length)) {
    throw new TextParseError(
      'A plural must provide 1, 2, 3, or 6 variants',
      position,
    );
  }

  if (values.length === 1) {
    return { kind: 'plural', key, other: values[0] };
  }

  if (values.length === 2) {
    return { kind: 'plural', key, one: values[0], other: values[1] };
  }

  if (values.length === 3) {
    return {
      kind: 'plural',
      key,
      zero: values[0],
      one: values[1],
      other: values[2],
    };
  }

  return {
    kind: 'plural',
    key,
    zero: values[0],
    one: values[1],
    two: values[2],
    few: values[3],
    many: values[4],
    other: values[5],
  };
}

/**
 * Splits syntax at each unescaped delimiter outside nested braces.
 *
 * @param text - Syntax content to split.
 * @param delimiter - Delimiter that separates the content.
 * @returns The separated syntax parts.
 *
 * @internal
 */
function splitSyntax(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let partStart = 0;

  for (let cursor = 0; cursor < text.length; cursor += 1) {
    if (isEscaped(text, cursor)) {
      continue;
    }

    if (text[cursor] === '{') {
      depth += 1;
    } else if (text[cursor] === '}') {
      depth -= 1;
    } else if (text[cursor] === delimiter && depth === 0) {
      parts.push(text.slice(partStart, cursor));
      partStart = cursor + 1;
    }
  }

  parts.push(text.slice(partStart));
  return parts;
}

/**
 * Splits syntax at its first unescaped delimiter.
 *
 * @param text - Syntax content to split.
 * @param delimiter - Delimiter that separates the content.
 * @returns The content before and after the first matching delimiter.
 *
 * @internal
 */
function splitFirstSyntax(text: string, delimiter: string): [string, string?] {
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    if (isEscaped(text, cursor)) {
      continue;
    }

    if (text[cursor] === delimiter) {
      return [text.slice(0, cursor), text.slice(cursor + 1)];
    }
  }

  return [text];
}

/**
 * Reports whether a character is preceded by an odd number of backslashes.
 *
 * @param text - Text containing the character.
 * @param position - Character position to inspect.
 * @returns Whether the character is escaped.
 *
 * @internal
 */
function isEscaped(text: string, position: number): boolean {
  let backslashes = 0;

  for (let cursor = position - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    backslashes += 1;
  }

  return backslashes % 2 === 1;
}

/**
 * Restores escaped translation syntax delimiters.
 *
 * @param value - Syntax value containing escaped delimiters.
 * @returns The value with delimiter escape markers removed.
 *
 * @internal
 */
function unescapeSyntax(value: string): string {
  return value.replace(ESCAPABLE_DELIMITER, '$1');
}

/**
 * The bounds and content of a scanned translation expression.
 * @internal
 */
interface ParsedExpression {
  /**
   * Expression content without its outer braces.
   * @internal
   */
  content: string;
  /**
   * Index immediately after the expression.
   * @internal
   */
  end: number;
  /**
   * Whether the expression used plural double braces.
   * @internal
   */
  plural: boolean;
}

/** An ordered collection of parts parsed from a translation message. */
export type ParsedMessage = ParsedMessagePart[];

/** A text, plural, or parameter part parsed from a translation message. */
export type ParsedMessagePart = TextPart | PluralPart | ParameterPart;

/** Literal text included in the translated output unchanged. */
export interface TextPart {
  /** Identifies the parsed part as literal text. */
  kind: 'text';
  /** The literal text content. */
  content: string;
}

/** Locale-aware plural variants selected using a numeric translation parameter. */
export interface PluralPart {
  /** Identifies the parsed part as a plural expression. */
  kind: 'plural';
  /** The numeric parameter used to select a plural variant. */
  key: string;
  /** Text for the locale's `zero` plural category. */
  zero?: string;
  /** Text for the locale's `one` plural category. */
  one?: string;
  /** Text for the locale's `two` plural category. */
  two?: string;
  /** Text for the locale's `few` plural category. */
  few?: string;
  /** Text for the locale's `many` plural category. */
  many?: string;
  /** Fallback text for the locale's `other` plural category. */
  other: string;
}

/** A named value inserted into a translation and optionally transformed. */
export interface ParameterPart {
  /** Identifies the parsed part as a parameter expression. */
  kind: 'parameter';
  /** Parameter name used to retrieve its runtime value. */
  key: string;
  /** Declared parameter type, or `unknown` when omitted. */
  type: string;
  /** Whether the parameter may be omitted from translation values. */
  optional: boolean;
  /** Transforms applied to the parameter in declaration order. */
  transforms: TransformParameterPart[];
}

/** A formatter or switch-case transform applied to a translation parameter. */
export type TransformParameterPart = FormatterPart | SwitchCasePart;

/** A named formatter applied to a translation parameter. */
export interface FormatterPart {
  /** Identifies the transform as a formatter. */
  kind: 'formatter';
  /** Registered formatter name. */
  name: string;
}

/** A switch-case transform mapping parameter values to replacement text. */
export interface SwitchCasePart {
  /** Identifies the transform as a switch-case expression. */
  kind: 'switch-case';
  /** Parsed mappings available to the switch expression. */
  cases: SwitchCase[];
  /** Original brace-delimited switch expression. */
  raw: string;
}

/** A single value-to-text mapping in a switch-case transform. */
export interface SwitchCase {
  /** Parameter value to match, or `*` for the fallback case. */
  key: string;
  /** Replacement text produced when the case matches. */
  value: string;
}
