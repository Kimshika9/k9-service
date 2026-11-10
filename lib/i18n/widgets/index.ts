import { en } from './en.ts';
import { my } from './my.ts';
export type WidgetLocale = 'en' | 'my';
export const widgetLocale = (language?: string): WidgetLocale => /^my(?:-|$)/i.test(language ?? '') ? 'my' : 'en';
export const widgetCopy = { en, my };
