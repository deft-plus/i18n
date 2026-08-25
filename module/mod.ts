// Copyright the Deft+ authors. All rights reserved. Apache-2.0 license

/**
 * Provides translation message parsing and its structured result types.
 *
 * @module
 */

export { parseText, TextParseError } from './parser.ts';
export type {
  FormatterPart,
  ParameterPart,
  ParsedMessage,
  ParsedMessagePart,
  PluralPart,
  SwitchCase,
  SwitchCasePart,
  TextPart,
  TransformParameterPart,
} from './parser.ts';
