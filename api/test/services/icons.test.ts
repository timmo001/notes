import app from '../../src/app';

describe("'icons' service", () => {
  it('registered the service', () => {
    const service = app.service('icons');
    expect(service).toBeTruthy();
  });
});
