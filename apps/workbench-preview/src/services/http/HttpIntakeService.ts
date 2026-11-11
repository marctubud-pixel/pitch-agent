/**
 * Placeholder for a real brief-parsing service. Extraction and field mapping stay separate
 * calls, so a backend can, for example, extract on upload and map with a language model.
 * Until it is connected, both report the service as unavailable.
 */
import { IntakeError, type BriefIntakeService, type ExtractedDocument, type SampleBrief, type TaskCardMapping } from '../../domain/intake';

export class HttpIntakeService implements BriefIntakeService {
  readonly simulated = false;
  constructor(private readonly options: { baseUrl: string }) {}
  async listSamples(): Promise<SampleBrief[]> {
    return [];
  }
  async getSampleFile(): Promise<File> {
    throw new IntakeError('unavailable');
  }
  async extractText(): Promise<ExtractedDocument> {
    // POST `${this.options.baseUrl}/briefs/extract` with the file, then map the response.
    void this.options;
    throw new IntakeError('unavailable', 'Brief extraction is not connected to a backend yet.');
  }
  async mapToTaskCard(): Promise<TaskCardMapping> {
    throw new IntakeError('unavailable', 'Brief field mapping is not connected to a backend yet.');
  }
}
