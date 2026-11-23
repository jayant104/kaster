import * as MediaLibrary from 'expo-media-library';
import { MobileDatabaseService } from './mobileDatabase';

export interface ScannerProgress {
  isScanning: boolean;
  totalAssets: number;
  processedAssets: number;
  currentFilename: string;
}

export class MediaScannerService {
  private static instance: MediaScannerService;
  private db: MobileDatabaseService;
  private progress: ScannerProgress = {
    isScanning: false,
    totalAssets: 0,
    processedAssets: 0,
    currentFilename: ''
  };

  private constructor() {
    this.db = MobileDatabaseService.getInstance();
  }

  public static getInstance(): MediaScannerService {
    if (!MediaScannerService.instance) {
      MediaScannerService.instance = new MediaScannerService();
    }
    return MediaScannerService.instance;
  }

  public getProgress(): ScannerProgress {
    return { ...this.progress };
  }

  public async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      return status === 'granted';
    } catch (e) {
      console.error('[Permissions Error]:', e);
      return false;
    }
  }

  public async scanDevicePhotos(
    onProgress?: (progress: ScannerProgress) => void,
    maxPhotos: number = 200
  ): Promise<{ total: number; indexed: number; skipped: number }> {
    if (this.progress.isScanning) {
      return { total: 0, indexed: 0, skipped: 0 };
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      console.warn('[MediaScanner] Permission not granted to read device media library.');
      return { total: 0, indexed: 0, skipped: 0 };
    }

    this.progress.isScanning = true;
    let indexedCount = 0;
    let skippedCount = 0;

    try {
      // Fetch device photos from camera roll / DCIM
      const assetsResult = await MediaLibrary.getAssetsAsync({
        first: maxPhotos,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]]
      });

      const assets = assetsResult.assets;
      this.progress.totalAssets = assets.length;
      this.progress.processedAssets = 0;

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        this.progress.processedAssets = i + 1;
        this.progress.currentFilename = asset.filename;

        if (onProgress) {
          onProgress({ ...this.progress });
        }

        const isIndexed = await this.db.isPhotoIndexed(asset.id);
        if (isIndexed) {
          skippedCount++;
          continue;
        }

        // Generate preliminary tags and schedule on-device inference
        // In Step 3, this links directly to the onnxInference service
        indexedCount++;
      }

      return {
        total: assets.length,
        indexed: indexedCount,
        skipped: skippedCount
      };
    } catch (e) {
      console.error('[MediaScanner Error]:', e);
      return { total: 0, indexed: indexedCount, skipped: skippedCount };
    } finally {
      this.progress.isScanning = false;
      this.progress.currentFilename = '';
    }
  }
}
