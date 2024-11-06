# 🌍 I18n

[![JSR](https://jsr.io/badges/@deft-plus/i18n)](https://jsr.io/@deft-plus/i18n) [![JSR Score](https://jsr.io/badges/@deft-plus/i18n/score)](https://jsr.io/@deft-plus/i18n)

The `@deft-plus/i18n` module provides a simple and efficient way to manage internationalization in your application.

This module contains i18n implementation.

Conceptually, the i18n module is composed of four parts: the runtime, the CLI and the explorer.

## Runtime

The runtime is responsible for handling the i18n logic. It is composed of the `i18n` function which is the entry point for the i18n translations, this function will return a `I18n` object which contains the translations and the `locale` of the current page with multiple features.

## CLI

The CLI is responsible for compiling the i18n translations from the json file into a typescript typings file and to download the self-hosted translations from the Explorer into the local assets folder. This part will create the file that will be used by the runtime to get type-safe translations.

## Explorer

The explorer is a self-hosted web application which allows you to explore, modify, add and remove translations. It is composed of a backend and a frontend. The backend is responsible for handling the translations and host them in cache. While the frontend is responsible for handling the UI and the interactions with the backend to CRUD the translations.

## Installation

Install the `@deft-plus/i18n` package using deno:

```bash
deno add @deft-plus/i18n
```

Or using npm:

```bash
npx jsr add @deft-plus/i18n
```
