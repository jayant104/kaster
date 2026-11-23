import * as SQLite from 'expo-sqlite';
import { PhotoItem, PhotoInspectionData, CategoryItem } from '../types';

export class MobileDatabaseService {
  private static instance: MobileDatabaseService;
  private db: SQLite.SQLiteDatabase | null = null;

  private constructor() {}

  public static getInstance(): MobileDatabaseService {
    if (!MobileDatabaseService.instance) {
      MobileDatabaseService.instance = new MobileDatabaseService();
    }
    return MobileDatabaseService.instance;
  }

  public async init(): Promise<void> {
    if (this.db) return;

    try {
      this.db = await SQLite.openDatabaseAsync('smart_gallery.db');

      // Enable WAL mode for high performance
      await this.db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS photos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_id TEXT UNIQUE NOT NULL,
          uri TEXT NOT NULL,
          filename TEXT NOT NULL,
          width INTEGER,
          height INTEGER,
          mirage_json TEXT,
          llm_tags TEXT,
          llm_categories TEXT,
          indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_photos_asset_id ON photos(asset_id);

        CREATE VIRTUAL TABLE IF NOT EXISTS photos_fts USING fts5(
          photo_id UNINDEXED,
          filename,
          scene,
          objects_text,
          ocr_text,
          llm_tags,
          llm_categories,
          all_search_text,
          tokenize = 'unicode61 remove_diacritics 2'
        );
      `);
      console.log('[MobileDB] Initialized SQLite with FTS5 successfully.');
    } catch (e) {
      console.error('[MobileDB Init Error]:', e);
      throw e;
    }
  }

  public async isPhotoIndexed(assetId: string): Promise<boolean> {
    if (!this.db) await this.init();
    const result = await this.db!.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM photos WHERE asset_id = ?',
      [assetId]
    );
    return (result?.count || 0) > 0;
  }

  public async insertPhoto(data: {
    assetId: string;
    uri: string;
    filename: string;
    width: number;
    height: number;
    mirageJson: any;
    tags: string[];
    categories: string[];
  }): Promise<number> {
    if (!this.db) await this.init();

    const mirageJsonStr = JSON.stringify(data.mirageJson || {});
    const tagsStr = data.tags.join(', ');
    const categoriesStr = data.categories.join(', ');

    const sceneDesc = data.mirageJson?.scene?.description || '';
    const objectsText = (data.mirageJson?.objects || []).map((o: any) => o.name).join(' ');
    const ocrText = (data.mirageJson?.text || []).map((t: any) => t.content || t).join(' ');
    const allSearchText = `${data.filename} ${sceneDesc} ${objectsText} ${ocrText} ${tagsStr} ${categoriesStr}`;

    // Insert or replace into main table
    const result = await this.db!.runAsync(
      `INSERT OR REPLACE INTO photos (
        asset_id, uri, filename, width, height, mirage_json, llm_tags, llm_categories, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);`,
      [
        data.assetId,
        data.uri,
        data.filename,
        data.width,
        data.height,
        mirageJsonStr,
        tagsStr,
        categoriesStr
      ]
    );

    const photoId = result.lastInsertRowId;

    // Delete old FTS if exists
    await this.db!.runAsync('DELETE FROM photos_fts WHERE photo_id = ?', [String(photoId)]);

    // Insert into FTS5
    await this.db!.runAsync(
      `INSERT INTO photos_fts (
        photo_id, filename, scene, objects_text, ocr_text, llm_tags, llm_categories, all_search_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        String(photoId),
        data.filename,
        sceneDesc,
        objectsText,
        ocrText,
        tagsStr,
        categoriesStr,
        allSearchText
      ]
    );

    return photoId;
  }

  public async searchKeyword(query: string, limit: number = 40): Promise<PhotoItem[]> {
    if (!this.db) await this.init();
    const q = query.trim();
    if (!q) return this.getPhotos('All', limit);

    // Format query for FTS5 (prefix matching with OR)
    const tokens = q.split(/\s+/).filter(t => t.length > 0);
    const ftsTokens = tokens.map(t => `"${t.replace(/[^a-zA-Z0-9_\-]/g, '')}"*`);
    const ftsQuery = ftsTokens.join(' OR ');

    try {
      const rows = await this.db!.getAllAsync<{
        id: number;
        uri: string;
        filename: string;
        width: number;
        height: number;
        llm_categories: string;
        rank: number;
      }>(
        `SELECT 
          p.id, p.uri, p.filename, p.width, p.height, p.llm_categories,
          bm25(photos_fts) as rank
        FROM photos_fts f
        JOIN photos p ON p.id = CAST(f.photo_id AS INTEGER)
        WHERE photos_fts MATCH ?
        ORDER BY rank ASC
        LIMIT ?;`,
        [ftsQuery, limit]
      );

      return rows.map((r: any) => ({
        id: r.id,
        uri: r.uri,
        filename: r.filename,
        width: r.width || 800,
        height: r.height || 600,
        categories: (r.llm_categories || '').split(',').map((c: string) => c.trim()).filter(Boolean),
        score: Math.min(99, Math.max(10, Math.round(100 - r.rank * 10)))
      }));
    } catch (e) {
      console.warn('[FTS Fallback to LIKE]:', e);
      const rows = await this.db!.getAllAsync<{
        id: number;
        uri: string;
        filename: string;
        width: number;
        height: number;
        llm_categories: string;
      }>(
        `SELECT id, uri, filename, width, height, llm_categories
        FROM photos
        WHERE filename LIKE ? OR llm_tags LIKE ? OR mirage_json LIKE ?
        ORDER BY id DESC LIMIT ?;`,
        [`%${q}%`, `%${q}%`, `%${q}%`, limit]
      );

      return rows.map((r: any) => ({
        id: r.id,
        uri: r.uri,
        filename: r.filename,
        width: r.width || 800,
        height: r.height || 600,
        categories: (r.llm_categories || '').split(',').map((c: string) => c.trim()).filter(Boolean),
        score: 75
      }));
    }
  }

  public async getPhotos(category: string = 'All', limit: number = 60, offset: number = 0): Promise<PhotoItem[]> {
    if (!this.db) await this.init();

    let rows: any[];
    if (!category || category === 'All') {
      rows = await this.db!.getAllAsync<any>(
        'SELECT id, uri, filename, width, height, llm_categories, llm_tags, indexed_at FROM photos ORDER BY id DESC LIMIT ? OFFSET ?;',
        [limit, offset]
      );
    } else {
      rows = await this.db!.getAllAsync<any>(
        'SELECT id, uri, filename, width, height, llm_categories, llm_tags, indexed_at FROM photos WHERE llm_categories LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?;',
        [`%${category}%`, limit, offset]
      );
    }

    return rows.map((r: any) => ({
      id: r.id,
      uri: r.uri,
      filename: r.filename,
      width: r.width || 800,
      height: r.height || 600,
      categories: (r.llm_categories || '').split(',').map((c: string) => c.trim()).filter(Boolean),
      tags_count: (r.llm_tags || '').split(',').filter(Boolean).length,
      indexed_at: r.indexed_at
    }));
  }

  public async getCategories(): Promise<CategoryItem[]> {
    if (!this.db) await this.init();
    const rows = await this.db!.getAllAsync<{ llm_categories: string }>(
      'SELECT llm_categories FROM photos WHERE llm_categories IS NOT NULL;'
    );

    const counts: Record<string, number> = {};
    let total = 0;

    for (const r of rows) {
      total++;
      const cats = (r.llm_categories || '').split(',').map((c: string) => c.trim()).filter(Boolean);
      for (const c of cats) {
        counts[c] = (counts[c] || 0) + 1;
      }
    }

    const items: CategoryItem[] = [{ name: 'All', count: total }];
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      items.push({ name, count });
    }
    return items;
  }

  public async getPhotoInspect(photoId: number | string): Promise<PhotoInspectionData | null> {
    if (!this.db) await this.init();
    const r = await this.db!.getFirstAsync<any>(
      'SELECT * FROM photos WHERE id = ?;',
      [photoId]
    );

    if (!r) return null;

    let mirageData: any = {};
    try {
      mirageData = JSON.parse(r.mirage_json || '{}');
    } catch {}

    const tags = (r.llm_tags || '').split(',').map((t: string) => t.trim()).filter(Boolean);
    const categories = (r.llm_categories || '').split(',').map((c: string) => c.trim()).filter(Boolean);

    return {
      photo: {
        id: r.id,
        uri: r.uri,
        filename: r.filename,
        width: r.width || 800,
        height: r.height || 600,
        categories
      },
      perception: {
        scene: mirageData.scene || { description: 'Scene analyzed on device.' },
        objects: mirageData.objects || [],
        ocr: mirageData.text || []
      },
      hidden_semantic_index: {
        llm_tags: tags,
        llm_categories: categories
      }
    };
  }
}
