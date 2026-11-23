import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  Dimensions,
  ActivityIndicator,
  Platform
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Search, X, Sparkles, SlidersHorizontal, RefreshCw, Eye, EyeOff } from 'lucide-react-native';

import { THEME } from './src/constants/theme';
import { PhotoItem, CategoryItem, PhotoInspectionData } from './src/types';
import { MobileDatabaseService } from './src/services/mobileDatabase';
import { MediaScannerService } from './src/services/mediaScanner';
import { BackgroundIndexerService } from './src/services/backgroundIndexer';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLUMN_WIDTH = (SCREEN_WIDTH - 44) / 2;

export default function App() {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([
    { name: 'All', count: 0 },
    { name: 'People', count: 0 },
    { name: 'Indoor', count: 0 },
    { name: 'Outdoor', count: 0 },
    { name: 'Documents', count: 0 }
  ]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchLatencyMs, setSearchLatencyMs] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [totalPhotosCount, setTotalPhotosCount] = useState<number>(0);

  // Inspector State
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | string | null>(null);
  const [inspectData, setInspectData] = useState<PhotoInspectionData | null>(null);
  const [showBBoxes, setShowBBoxes] = useState<boolean>(true);
  const [highlightedObjIndex, setHighlightedObjIndex] = useState<number | null>(null);

  const db = MobileDatabaseService.getInstance();
  const scanner = MediaScannerService.getInstance();
  const searchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
      await db.init();
      await seedDemoDataIfEmpty();
      await refreshGallery();
    } catch (e) {
      console.error('[Init Error]:', e);
    }
  };

  const seedDemoDataIfEmpty = async () => {
    const existing = await db.getPhotos('All', 1);
    if (existing.length === 0) {
      console.log('[MobileApp] First launch detected. Seeding verified on-device demo photos...');
      await db.insertPhoto({
        assetId: 'demo_101',
        uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
        filename: 'IMG_20260709_101430.jpg',
        width: 3456,
        height: 4608,
        mirageJson: {
          scene: { description: 'A young man in a white shirt with graphic logo indoors near window.' },
          objects: [
            { name: 'young man', score: 0.90, bbox: [120, 250, 920, 780] },
            { name: 'white t-shirt', score: 0.72, bbox: [410, 310, 890, 720] },
            { name: 'logo', score: 0.45, bbox: [480, 480, 560, 540] },
            { name: 'window', score: 0.50, bbox: [80, 680, 750, 980] }
          ],
          text: [{ content: 'AMI PARIS', bbox: [480, 480, 560, 540] }]
        },
        tags: ['aadmi', 'ceiling light', 'ghar', 'indoor', 'kapde', 'khidki', 'logo', 'purush', 'safed', 'safed shirt', 'shirt', 't-shirt', 'young man'],
        categories: ['People', 'Indoor']
      });

      await db.insertPhoto({
        assetId: 'demo_102',
        uri: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80',
        filename: 'electricity_bill.jpg',
        width: 2400,
        height: 3200,
        mirageJson: {
          scene: { description: 'Official document and bill payment receipt.' },
          objects: [
            { name: 'paper', score: 0.92, bbox: [200, 150, 850, 850] },
            { name: 'document', score: 0.88, bbox: [220, 180, 820, 820] }
          ],
          text: [{ content: 'ELECTRICITY BILL PAYMENT', bbox: [250, 200, 350, 800] }]
        },
        tags: ['bill', 'bijli ka bill', 'document', 'kagaz', 'paper', 'payment', 'transaction'],
        categories: ['Documents']
      });

      await db.insertPhoto({
        assetId: 'demo_103',
        uri: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80',
        filename: 'car_highway.jpg',
        width: 4032,
        height: 3024,
        mirageJson: {
          scene: { description: 'Modern car traveling on open highway.' },
          objects: [
            { name: 'car', score: 0.95, bbox: [300, 200, 750, 850] },
            { name: 'road', score: 0.89, bbox: [600, 0, 1000, 1000] }
          ],
          text: []
        },
        tags: ['auto', 'car', 'gaadi', 'gadi', 'highway', 'outdoor', 'road', 'vehicle'],
        categories: ['Vehicles', 'Outdoor']
      });
    }
  };

  const refreshGallery = async () => {
    try {
      const cats = await db.getCategories();
      if (cats.length > 0) setCategories(cats);

      const items = await db.getPhotos(activeCategory);
      setPhotos(items);
      setTotalPhotosCount(items.length);
    } catch (e) {
      console.error('[Refresh Error]:', e);
    }
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      const q = text.trim();
      if (!q) {
        setSearchLatencyMs(null);
        refreshGallery();
        return;
      }

      setIsSearching(true);
      const t0 = Date.now();
      try {
        const results = await db.searchKeyword(q, 40);
        const elapsed = Date.now() - t0;
        setSearchLatencyMs(elapsed);
        setPhotos(results);
      } catch (e) {
        console.error('[Search Error]:', e);
      } finally {
        setIsSearching(false);
      }
    }, 180);
  };

  const handleCategorySelect = async (catName: string) => {
    setActiveCategory(catName);
    setSearchQuery('');
    setSearchLatencyMs(null);
    try {
      const items = await db.getPhotos(catName);
      setPhotos(items);
    } catch (e) {
      console.error('[Category Filter Error]:', e);
    }
  };

  const handlePhotoPress = async (photoId: number | string) => {
    setSelectedPhotoId(photoId);
    setInspectData(null);
    setHighlightedObjIndex(null);
    try {
      const data = await db.getPhotoInspect(photoId);
      setInspectData(data);
    } catch (e) {
      console.error('[Inspect Error]:', e);
    }
  };

  const handleTriggerScan = async () => {
    setIsScanning(true);
    try {
      const indexer = BackgroundIndexerService.getInstance();
      await scanner.scanDevicePhotos(async (prog) => {
        // live scanner progress
      });
      await refreshGallery();
    } catch (e) {
      console.error('[Scan Trigger Error]:', e);
    } finally {
      setIsScanning(false);
    }
  };

  const renderPhotoItem = ({ item }: { item: PhotoItem }) => {
    return (
      <TouchableOpacity
        style={styles.photoCard}
        activeOpacity={0.85}
        onPress={() => handlePhotoPress(item.id)}
      >
        <Image
          source={{ uri: item.uri }}
          style={styles.photoImage}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.cardOverlay}>
          {item.score !== undefined && (
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreBadgeText}>{item.score}% Match</Text>
            </View>
          )}
          {item.categories.length > 0 && (
            <View style={styles.catPill}>
              <Text style={styles.catPillText}>{item.categories[0]}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar style="light" backgroundColor="#08090c" />

        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.brandGroup}>
            <View style={styles.brandIcon}>
              <Sparkles size={18} color="#f8fafc" />
            </View>
            <View>
              <Text style={styles.brandTitle}>Smart Gallery</Text>
              <Text style={styles.brandSubtitle}>Mirage VLM • 82M LLM</Text>
            </View>
          </View>
          <View style={styles.statPill}>
            <View style={styles.statDot} />
            <Text style={styles.statText}>{totalPhotosCount} Photos</Text>
          </View>
        </View>

        {/* Floating Search Bar */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Search size={16} color={THEME.colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search in Hindi or English ('safed shirt', 'kagaz')..."
              placeholderTextColor={THEME.colors.textMuted}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchLatencyMs !== null && (
              <View style={styles.latencyBadge}>
                <Text style={styles.latencyText}>⚡ {searchLatencyMs}ms</Text>
              </View>
            )}
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearchChange('')} style={styles.clearBtn}>
                <X size={16} color={THEME.colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Category Filter Pills Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.name}
              style={[
                styles.categoryPill,
                activeCategory === cat.name && styles.categoryPillActive
              ]}
              onPress={() => handleCategorySelect(cat.name)}
            >
              <Text
                style={[
                  styles.categoryText,
                  activeCategory === cat.name && styles.categoryTextActive
                ]}
              >
                {cat.name}
              </Text>
              <View
                style={[
                  styles.countBadge,
                  activeCategory === cat.name && styles.countBadgeActive
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    activeCategory === cat.name && styles.countTextActive
                  ]}
                >
                  {cat.count}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 120Hz Photo Grid */}
        <FlatList
          data={photos}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPhotoItem}
          numColumns={2}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No matching photos found</Text>
              <Text style={styles.emptySub}>
                Try searching 'safed shirt', 'aadmi', 'kagaz', or 'car'.
              </Text>
            </View>
          }
        />

        {/* Slide-Over / Bottom Modal Inspector */}
        <Modal
          visible={selectedPhotoId !== null}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setSelectedPhotoId(null)}
        >
          <View style={styles.modalBackdrop}>
            <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    {inspectData?.photo.filename || 'Visual Inspector'}
                  </Text>
                  <Text style={styles.modalMeta}>
                    {inspectData ? `${inspectData.photo.width} × ${inspectData.photo.height}` : 'Loading perception...'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setSelectedPhotoId(null)}
                >
                  <X size={20} color="#f8fafc" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Image Viewport with Bounding Box Overlay */}
                {inspectData && (
                  <View style={styles.inspectViewport}>
                    <Image
                      source={{ uri: inspectData.photo.uri }}
                      style={styles.inspectImage}
                      contentFit="contain"
                    />
                    {showBBoxes && inspectData.perception.objects.map((obj, idx) => {
                      if (!obj.bbox || obj.bbox.length !== 4) return null;
                      const [ymin, xmin, ymax, xmax] = obj.bbox;
                      const color = THEME.colors.boxColors[idx % THEME.colors.boxColors.length];
                      const isHighlighted = highlightedObjIndex === idx;

                      return (
                        <View
                          key={idx}
                          style={[
                            styles.boxOverlay,
                            {
                              top: `${ymin / 10}%`,
                              left: `${xmin / 10}%`,
                              width: `${(xmax - xmin) / 10}%`,
                              height: `${(ymax - ymin) / 10}%`,
                              borderColor: color,
                              borderWidth: isHighlighted ? 3 : 1.5,
                              backgroundColor: isHighlighted ? 'rgba(56, 189, 248, 0.2)' : 'transparent'
                            }
                          ]}
                        >
                          <View style={[styles.boxBadge, { backgroundColor: '#090b10', borderColor: color }]}>
                            <Text style={[styles.boxLabel, { color }]}>
                              {obj.name} {Math.round(obj.score * 100)}%
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                    {showBBoxes && inspectData.perception.text && inspectData.perception.text.map((txt, idx) => {
                      if (!txt.bbox || txt.bbox.length !== 4) return null;
                      const [ymin, xmin, ymax, xmax] = txt.bbox;
                      return (
                        <View
                          key={`ocr-${idx}`}
                          style={[
                            styles.boxOverlay,
                            styles.ocrBoxOverlay,
                            {
                              top: `${ymin / 10}%`,
                              left: `${xmin / 10}%`,
                              width: `${(xmax - xmin) / 10}%`,
                              height: `${(ymax - ymin) / 10}%`,
                            }
                          ]}
                        >
                          <View style={styles.ocrBadge}>
                            <Text style={styles.ocrLabel}>OCR: {txt.content}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Controls */}
                <View style={styles.inspectControls}>
                  <TouchableOpacity
                    style={styles.toggleBtn}
                    onPress={() => setShowBBoxes(!showBBoxes)}
                  >
                    {showBBoxes ? <Eye size={16} color="#38bdf8" /> : <EyeOff size={16} color="#64748b" />}
                    <Text style={[styles.toggleText, showBBoxes && { color: '#38bdf8' }]}>
                      Bounding Boxes
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.engineBadge}>
                    <Text style={styles.engineBadgeText}>Cactus Mirage VLM</Text>
                  </View>
                </View>

                {/* Scene Perception Card */}
                {inspectData && (
                  <View style={styles.inspectSection}>
                    <Text style={styles.sectionHeading}>Scene Perception</Text>
                    <Text style={styles.sceneText}>
                      {inspectData.perception.scene.description}
                    </Text>
                  </View>
                )}

                {/* Detected Objects Chips */}
                {inspectData && inspectData.perception.objects.length > 0 && (
                  <View style={styles.inspectSection}>
                    <Text style={styles.sectionHeading}>
                      Detected Entities ({inspectData.perception.objects.length})
                    </Text>
                    <View style={styles.chipsContainer}>
                      {inspectData.perception.objects.map((obj, idx) => {
                        const color = THEME.colors.boxColors[idx % THEME.colors.boxColors.length];
                        const isHighlighted = highlightedObjIndex === idx;

                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[
                              styles.chip,
                              isHighlighted && { borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.2)' }
                            ]}
                            onPress={() => setHighlightedObjIndex(isHighlighted ? null : idx)}
                          >
                            <Text style={[styles.chipDot, { color }]}>●</Text>
                            <Text style={styles.chipName}>{obj.name}</Text>
                            <Text style={styles.chipScore}>{Math.round(obj.score * 100)}%</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Extracted Text (OCR) Chips */}
                {inspectData && inspectData.perception.text && inspectData.perception.text.length > 0 && (
                  <View style={styles.inspectSection}>
                    <Text style={styles.sectionHeading}>
                      Extracted Text / OCR ({inspectData.perception.text.length})
                    </Text>
                    <View style={styles.chipsContainer}>
                      {inspectData.perception.text.map((txt, idx) => (
                        <View key={`ocr-txt-${idx}`} style={styles.ocrChip}>
                          <Text style={styles.ocrChipContent}>{txt.content}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Hidden Semantic Index (82M LLM) */}
                {inspectData && (
                  <View style={styles.hiddenIndexSection}>
                    <Text style={styles.hiddenIndexTitle}>
                      🔒 Hidden Semantic Index (82M LLM)
                    </Text>
                    <Text style={styles.hiddenIndexDesc}>
                      These Hindi & English tags were generated on-device by your 82M LLM from Mirage outputs. They power instant search without cluttering the cards.
                    </Text>
                    <View style={styles.hiddenTagsContainer}>
                      {inspectData.hidden_semantic_index.llm_tags.map((tag, idx) => (
                        <View key={idx} style={styles.hiddenTagPill}>
                          <Text style={styles.hiddenTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>

        {/* Floating Scan Trigger Button */}
        <TouchableOpacity
          style={styles.scanFab}
          activeOpacity={0.85}
          onPress={handleTriggerScan}
          disabled={isScanning}
        >
          {isScanning ? (
            <ActivityIndicator size="small" color="#08090c" />
          ) : (
            <>
              <RefreshCw size={14} color="#08090c" />
              <Text style={styles.scanFabText}>Scan Photos</Text>
            </>
          )}
        </TouchableOpacity>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.bgBase
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  brandIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    letterSpacing: -0.3
  },
  brandSubtitle: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.radius.sm
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.colors.accentEmerald
  },
  statText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: THEME.colors.textSecondary
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.bgSurface,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    borderRadius: THEME.radius.full,
    paddingHorizontal: 12,
    height: 42
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    color: THEME.colors.textPrimary,
    fontSize: 13,
    height: '100%'
  },
  latencyBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6
  },
  latencyText: {
    color: THEME.colors.accentCyan,
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600'
  },
  clearBtn: {
    padding: 4
  },
  categoryRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle
  },
  categoryPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: THEME.colors.accentCyan
  },
  categoryText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '500'
  },
  categoryTextActive: {
    color: '#e0f2fe',
    fontWeight: '600'
  },
  countBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1
  },
  countBadgeActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.25)'
  },
  countText: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  countTextActive: {
    color: THEME.colors.accentCyan
  },
  gridContent: {
    padding: 16,
    gap: 12
  },
  photoCard: {
    width: COLUMN_WIDTH,
    height: COLUMN_WIDTH * 1.1,
    borderRadius: THEME.radius.md,
    overflow: 'hidden',
    backgroundColor: THEME.colors.bgCard,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    margin: 6,
    position: 'relative'
  },
  photoImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#090b10'
  },
  cardOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  scoreBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  scoreBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#08090c',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  catPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  catPillText: {
    fontSize: 9,
    color: '#e2e8f0',
    fontWeight: '500'
  },
  emptyContainer: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 10
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginBottom: 4
  },
  emptySub: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    textAlign: 'center'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)'
  },
  modalContainer: {
    flex: 1,
    backgroundColor: THEME.colors.bgSurface
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary
  },
  modalMeta: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)'
  },
  modalBody: {
    flex: 1,
    padding: 20
  },
  inspectViewport: {
    width: '100%',
    height: 320,
    borderRadius: THEME.radius.md,
    overflow: 'hidden',
    backgroundColor: '#050608',
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    position: 'relative'
  },
  inspectImage: {
    width: '100%',
    height: '100%'
  },
  boxOverlay: {
    position: 'absolute'
  },
  boxBadge: {
    position: 'absolute',
    top: -16,
    left: 0,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderRadius: 3
  },
  boxLabel: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  ocrBoxOverlay: {
    borderColor: '#f59e0b',
    borderStyle: 'dashed',
    borderWidth: 1.5,
    backgroundColor: 'rgba(245, 158, 11, 0.12)'
  },
  ocrBadge: {
    position: 'absolute',
    bottom: -18,
    left: 0,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: '#090b10',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 3
  },
  ocrLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#f59e0b',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  ocrChip: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  ocrChipContent: {
    fontSize: 11,
    color: '#fde68a',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600'
  },
  inspectControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.bgElevated,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    borderRadius: THEME.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '500',
    color: THEME.colors.textSecondary
  },
  engineBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  engineBadgeText: {
    color: THEME.colors.accentCyan,
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600'
  },
  inspectSection: {
    backgroundColor: THEME.colors.bgCard,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    borderRadius: THEME.radius.md,
    padding: 14,
    marginTop: 14
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: THEME.colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8
  },
  sceneText: {
    fontSize: 13,
    color: '#e2e8f0',
    lineHeight: 18
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  chipDot: {
    fontSize: 10
  },
  chipName: {
    fontSize: 11,
    color: THEME.colors.textSecondary
  },
  chipScore: {
    fontSize: 10,
    color: THEME.colors.accentCyan,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  hiddenIndexSection: {
    backgroundColor: 'rgba(99, 102, 241, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderRadius: THEME.radius.md,
    padding: 14,
    marginTop: 14,
    marginBottom: 20
  },
  hiddenIndexTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a5b4fc',
    marginBottom: 6
  },
  hiddenIndexDesc: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    lineHeight: 16,
    marginBottom: 10
  },
  hiddenTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5
  },
  hiddenTagPill: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  hiddenTagText: {
    fontSize: 10,
    color: '#c7d2fe',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  scanFab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: '#38bdf8',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: THEME.radius.full,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8
  },
  scanFabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#08090c'
  }
});
