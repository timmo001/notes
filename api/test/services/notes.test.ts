import app from '../../src/app';

describe("'notes' service", (): void => {
  it('registered the service', (): void => {
    const service = app.service('notes');
    expect(service).toBeTruthy();
  });
});
