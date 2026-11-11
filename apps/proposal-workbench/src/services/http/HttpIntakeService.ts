import { LocalIntakeService } from '../intake/LocalIntakeService';
/** Extraction reads the user's actual file locally. Mapping copies matching headings only. */
export class HttpIntakeService extends LocalIntakeService {
  readonly simulated = false;
  constructor(_options: { baseUrl: string }) { super({ latency: 0, samples: false }); }
}
