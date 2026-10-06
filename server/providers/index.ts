// The one place that maps a platform to its adapter. Tests bypass this and pass fakes via createCtx.
import type { Platform } from '../types.ts';
import { linkedinProvider } from './linkedin.ts';
import type { Provider } from './types.ts';
import { webProvider } from './web.ts';
import { xProvider } from './x.ts';

export function getProviders(): Record<Platform, Provider> {
  return { linkedin: linkedinProvider, x: xProvider, web: webProvider };
}
