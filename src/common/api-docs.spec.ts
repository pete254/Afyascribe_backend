import { apiDocsEnabled } from './api-docs';

describe('apiDocsEnabled', () => {
  it('is off in production by default', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('is on in development by default', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(apiDocsEnabled({})).toBe(true);
  });

  it('can be turned on in production deliberately', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: 'true' })).toBe(true);
  });

  it('can be turned off anywhere, and anything but "true" means off', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'development', API_DOCS: 'false' })).toBe(false);
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: 'yes' })).toBe(false);
  });
});
