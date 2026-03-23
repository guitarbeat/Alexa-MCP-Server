import { describe, it, expect } from 'vitest';
import { buildAlexaHeaders } from '../src/utils/alexa';
import type { Env } from '../src/types/alexa';

describe('buildAlexaHeaders', () => {
  it('should build headers with correctly formatted cookies', () => {
    const env: Env = {
      UBID_MAIN: 'ubid-123',
      AT_MAIN: 'at-123',
    };

    const headers = buildAlexaHeaders(env);

    expect(headers).toBeDefined();
    expect(headers.Cookie).toBe('csrf=1; ubid-main=ubid-123; at-main=at-123');
    expect(headers.Csrf).toBe('1');
    expect(headers.Accept).toBe('application/json; charset=utf-8');
    expect(headers['Accept-Language']).toBe('en-US');
    expect(headers['User-Agent']).toContain('PitanguiBridge');
  });

  it('should merge additional headers correctly', () => {
    const env: Env = {
      UBID_MAIN: 'ubid-123',
      AT_MAIN: 'at-123',
    };

    const additional = {
      'Content-Type': 'application/json',
      'X-Custom': 'test',
    };

    const headers = buildAlexaHeaders(env, additional);

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Custom']).toBe('test');
    expect(headers.Cookie).toBe('csrf=1; ubid-main=ubid-123; at-main=at-123');
  });
});
