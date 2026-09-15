import type { Fixture } from './fixture';
import { MockState } from './mock-state';

const DEFAULT_FIXTURE: Fixture = { text: '[1,2,3]', items: 3 };

describe('MockState', () => {
  it('starts in mode ok with the default fixture and requests 0', () => {
    const state = new MockState(DEFAULT_FIXTURE);

    expect(state.fixture).toBe(DEFAULT_FIXTURE);
    expect(state.view()).toEqual({ mode: 'ok', requests: 0, fixtureItems: 3 });
  });

  it('counts each recorded request once', () => {
    const state = new MockState(DEFAULT_FIXTURE);

    state.recordRequest();
    state.recordRequest();
    state.setMode('http500');
    state.setFixture({ text: '[]', items: 0 });

    expect(state.view().requests).toBe(2);
  });

  it('restores mode, fixture and counter to their initial values on reset', () => {
    const state = new MockState(DEFAULT_FIXTURE);
    state.setMode('timeout');
    state.setFixture({ text: '[]', items: 0 });
    state.recordRequest();

    state.reset();

    expect(state.mode).toBe('ok');
    expect(state.fixture).toBe(DEFAULT_FIXTURE);
    expect(state.view()).toEqual({ mode: 'ok', requests: 0, fixtureItems: 3 });
  });
});
