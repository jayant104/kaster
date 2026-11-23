export interface PhotoItem {
  id: string | number;
  uri: string;
  filename: string;
  width: number;
  height: number;
  categories: string[];
  tags_count?: number;
  score?: number;
  indexed_at?: string;
}

export interface BoundingBoxObject {
  id?: string;
  name: string;
  score: number;
  bbox: number[]; // [ymin, xmin, ymax, xmax] 0-1000
}

export interface OcrItem {
  content: string;
  bbox?: number[];
}

export interface PerceptionData {
  scene: {
    description: string;
    confidence?: number;
  };
  objects: BoundingBoxObject[];
  ocr: OcrItem[];
}

export interface HiddenSemanticIndex {
  llm_tags: string[];
  llm_categories: string[];
}

export interface PhotoInspectionData {
  photo: PhotoItem;
  perception: PerceptionData;
  hidden_semantic_index: HiddenSemanticIndex;
}

export interface CategoryItem {
  name: string;
  count: number;
}
