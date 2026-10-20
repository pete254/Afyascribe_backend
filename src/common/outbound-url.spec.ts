import { insecureEndpointReason } from './outbound-url';

describe('insecureEndpointReason', () => {
  it('accepts https', () => {
    expect(insecureEndpointReason('https://idsr.county.go.ke/alerts', 'IDSR_ALERT_URL')).toBeNull();
  });

  it('refuses plain http to anywhere else', () => {
    expect(insecureEndpointReason('http://idsr.county.go.ke/alerts', 'IDSR_ALERT_URL')).toMatch(
      /IDSR_ALERT_URL must be an https:\/\/ address/,
    );
  });

  it('allows plain http to this machine, for testing', () => {
    expect(insecureEndpointReason('http://localhost:4000/x', 'S')).toBeNull();
    expect(insecureEndpointReason('http://127.0.0.1/x', 'S')).toBeNull();
  });

  it('refuses other schemes and garbage', () => {
    expect(insecureEndpointReason('ftp://example.com', 'S')).toMatch(/must be an https/);
    expect(insecureEndpointReason('not a url', 'S')).toMatch(/not a valid address/);
  });
});
