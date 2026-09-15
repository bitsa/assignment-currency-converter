import type { Fixture } from './fixture';
import type { MockMode } from './mock-mode';

export interface MockStateView {
  readonly mode: MockMode;
  readonly requests: number;
  readonly fixtureItems: number;
}

/** In-memory state: current mode, current fixture and the `/bank/currency` request counter. */
export class MockState {
  private currentMode: MockMode = 'ok';
  private currentFixture: Fixture;
  private requests = 0;

  constructor(private readonly defaultFixture: Fixture) {
    this.currentFixture = defaultFixture;
  }

  get mode(): MockMode {
    return this.currentMode;
  }

  get fixture(): Fixture {
    return this.currentFixture;
  }

  setMode(mode: MockMode): void {
    this.currentMode = mode;
  }

  setFixture(fixture: Fixture): void {
    this.currentFixture = fixture;
  }

  recordRequest(): void {
    this.requests++;
  }

  reset(): void {
    this.currentMode = 'ok';
    this.currentFixture = this.defaultFixture;
    this.requests = 0;
  }

  view(): MockStateView {
    return {
      mode: this.currentMode,
      requests: this.requests,
      fixtureItems: this.currentFixture.items,
    };
  }
}
