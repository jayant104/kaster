/**
 * Mobile Background Auto-Indexer Service.
 * Scans phone photos, runs on-device perception & LLM tagging, and populates SQLite FTS5.
 */
import { MobileDatabaseService } from './mobileDatabase';
import { OnnxInferenceService } from './onnxInference';

export interface IndexerProgress {
  isIndexing: boolean;
  total: number;
  processed: number;
  currentFilename: string;
}

export class BackgroundIndexerService {
  private static instance: BackgroundIndexerService;
  private db: MobileDatabaseService;
  private inference: OnnxInferenceService;

  private progress: IndexerProgress = {
    isIndexing: false,
    total: 0,
    processed: 0,
    currentFilename: ''
  };

  private constructor() {
    this.db = MobileDatabaseService.getInstance();
    this.inference = OnnxInferenceService.getInstance();
  }

  public static getInstance(): BackgroundIndexerService {
    if (!BackgroundIndexerService.instance) {
      BackgroundIndexerService.instance = new BackgroundIndexerService();
    }
    return BackgroundIndexerService.instance;
  }

  public getProgress(): IndexerProgress {
    return { ...this.progress };
  }

  public async indexPhotoBatch(
    photos: Array<{ id: string; uri: string; filename: string; width: number; height: number }>,
    onProgress?: (progress: IndexerProgress) => void
  ): Promise<{ indexed: number; skipped: number }> {
    if (this.progress.isIndexing) {
      return { indexed: 0, skipped: 0 };
    }

    this.progress.isIndexing = true;
    this.progress.total = photos.length;
    this.progress.processed = 0;

    let indexedCount = 0;
    let skippedCount = 0;

    try {
      await this.db.init();
      await this.inference.init();

      for (let i = 0; i < photos.length; i++) {
        const item = photos[i];
        this.progress.processed = i + 1;
        this.progress.currentFilename = item.filename;

        if (onProgress) {
          onProgress({ ...this.progress });
        }

        // Check if already indexed
        const isIndexed = await this.db.isPhotoIndexed(item.id);
        if (isIndexed) {
          skippedCount++;
          continue;
        }

        // 1. Perception
        const perception = await this.inference.processImagePerception(item.uri, item.filename);

        // 2. 82M LLM Tag Generation
        const semanticIndex = await this.inference.generateHiddenTags(
          perception.objects,
          perception.scene.description,
          perception.ocr
        );

        // 3. Save to Mobile SQLite FTS5 Database
        await this.db.insertPhoto({
          assetId: item.id,
          uri: item.uri,
          filename: item.filename,
          width: item.width,
          height: item.height,
          mirageJson: perception,
          tags: semanticIndex.llm_tags,
          categories: semanticIndex.llm_categories
        });

        indexedCount++;
      }

      return { indexed: indexedCount, skipped: skippedCount };
    } catch (e) {
      console.error('[BackgroundIndexer Error]:', e);
      return { indexed: indexedCount, skipped: skippedCount };
    } finally {
      this.progress.isIndexing = false;
      this.progress.currentFilename = '';
    }
  }
}
