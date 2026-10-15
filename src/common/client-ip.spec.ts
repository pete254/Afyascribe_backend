import { trustProxySetting } from './client-ip';

describe('trustProxySetting', () => {
  it('trusts exactly the number of hops given — nginx alone in front is 1', () => {
    expect(trustProxySetting({ TRUST_PROXY: '1' })).toBe(1);
    expect(trustProxySetting({ TRUST_PROXY: '2' })).toBe(2);
  });

  it('keeps Render as it always was when unset there', () => {
    expect(trustProxySetting({ RENDER: 'true' })).toBe(true);
  });

  it('trusts nothing when unset anywhere else, so a forged header is ignored', () => {
    expect(trustProxySetting({})).toBe(false);
  });

  it('lets an explicit setting override the Render default', () => {
    expect(trustProxySetting({ RENDER: 'true', TRUST_PROXY: 'false' })).toBe(false);
    expect(trustProxySetting({ RENDER: 'true', TRUST_PROXY: '1' })).toBe(1);
  });

  it('passes an address list through for Express to parse', () => {
    expect(trustProxySetting({ TRUST_PROXY: 'loopback, 10.0.0.0/8' })).toBe('loopback, 10.0.0.0/8');
  });
});
