/**
 * LOCATIONS SCREEN — weather-app style
 *
 * Architecture:
 * - Top half: scrollable list of location cards (Current Location + saved places).
 *   Tapping a card selects it and flies the embedded map to that location.
 *   Long-pressing a saved card shows a remove option.
 * - Bottom half: embedded MapLibre map (fixed height) showing the selected
 *   location's area with danger-zone overlays.
 * - "+" button → geocode search modal → saves to savedLocationsService.
 *
 * State:
 *   selectedId      — 'current' | saved location id
 *   currentCoords   — live GPS from locationService
 *   savedLocations  — from savedLocationsService (AsyncStorage)
 *   zones           — from mapService (GeoJSON danger zones)
 *
 * MapLibre v11 API (named imports, no default export, mapStyle not styleURL).
 * Build requirement: expo-dev-client. Does NOT work in Expo Go.
 *
 * Multi-Agent Note: Map data → mapService. Location data → locationService.
 * Saved places → savedLocationsService. Do not call AsyncStorage directly here.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { MapPin, Navigation, Plus, Search, X, Trash2 } from 'lucide-react-native';
import {
  Camera,
  type CameraRef,
  type Expression,
  GeoJSONSource,
  Layer,
  Map,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import { useTheme } from '@/contexts/PreferencesContext';
import { useI18n } from '@/i18n';
import { fetchAreaSummary, fetchDangerZones, fetchHeatmap } from '@/services/mapService';
import {
  requestLocationPermission,
  reverseGeocode,
  subscribeToLocation,
} from '@/services/locationService';
import {
  addSavedLocation,
  loadSavedLocations,
  removeSavedLocation,
} from '@/services/savedLocationsService';
import type { AreaSummary, DangerZoneCollection, HeatmapCollection, RiskLevel } from '@/types/map';
import type { Coordinates } from '@/types/location';
import type { SavedLocation } from '@/types/savedLocation';

const FONT = Platform.select({ ios: 'System', android: 'sans-serif' });
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER: [number, number] = [-8.8071, 39.7436]; // Leiria
const DEFAULT_ZOOM = 13;

// MapLibre danger zone paint expressions
const FILL_COLOR: Expression = [
  'match', ['get', 'riskLevel'],
  'low',    'rgba(34,197,94,0.22)',
  'medium', 'rgba(245,158,11,0.28)',
  'high',   'rgba(255,59,107,0.32)',
  'rgba(34,197,94,0.22)',
] as Expression;

const LINE_COLOR: Expression = [
  'match', ['get', 'riskLevel'],
  'low',    '#22C55E',
  'medium', '#F59E0B',
  'high',   '#FF3B6B',
  '#22C55E',
] as Expression;

const RISK_COLOR: Record<RiskLevel, string> = {
  low: '#22C55E', medium: '#F59E0B', high: '#FF3B6B',
};

// ─── Location Card ────────────────────────────────────────────────────────────

interface CardProps {
  name: string;
  subtitle: string;
  riskLevel?: RiskLevel;
  selected: boolean;
  removable?: boolean;
  onPress: () => void;
  onRemove?: () => void;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  glassBorder: string;
  glass: string;
  blurTint: 'light' | 'dark';
}

function LocationCard({
  name, subtitle, riskLevel, selected, removable,
  onPress, onRemove,
  accentColor, textColor, mutedColor, glassBorder, glass, blurTint,
}: CardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: selected ? accentColor : glassBorder, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <BlurView intensity={50} tint={blurTint} style={StyleSheet.absoluteFill} />
      <View style={[styles.cardContent, { backgroundColor: glass }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: textColor }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.cardSub, { color: mutedColor }]} numberOfLines={1}>{subtitle}</Text>
        </View>
        {riskLevel && (
          <View style={[styles.riskDot, { backgroundColor: RISK_COLOR[riskLevel] }]} />
        )}
        {removable && onRemove && (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onRemove(); }}
            style={[styles.removeBtn, { backgroundColor: `${accentColor}18` }]}
            hitSlop={8}
          >
            <Trash2 size={12} color={accentColor} strokeWidth={2.2} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LocationsScreen() {
  const t = useTheme();
  const { t: i18n } = useI18n();
  const cameraRef = useRef<CameraRef>(null);

  const [selectedId, setSelectedId]           = useState<string>('current');
  const [currentCoords, setCurrentCoords]     = useState<Coordinates | null>(null);
  const [currentAddress, setCurrentAddress]   = useState<string>('Locating…');
  const [hasPermission, setHasPermission]     = useState<boolean | null>(null);
  const [savedLocations, setSavedLocations]   = useState<SavedLocation[]>([]);
  const [zones, setZones]                     = useState<DangerZoneCollection | null>(null);
  const [heatmap, setHeatmap]                 = useState<HeatmapCollection | null>(null);

  // Search modal state
  const [searchOpen, setSearchOpen]           = useState(false);
  const [searchQuery, setSearchQuery]         = useState('');
  const [searchLoading, setSearchLoading]     = useState(false);
  const [searchError, setSearchError]         = useState<string | null>(null);
  const [suggestions, setSuggestions]         = useState<{ name: string; address: string; latitude: number; longitude: number }[]>([]);
  const debounceRef                           = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Area summary state (long-press)
  const [areaSummaryVisible, setAreaSummaryVisible]   = useState(false);
  const [areaSummary, setAreaSummary]                 = useState<AreaSummary | null>(null);
  const [pressedCoords, setPressedCoords]             = useState<[number, number] | null>(null);

  // Reset to current location and reload data on every focus
  useFocusEffect(useCallback(() => {
    loadSavedLocations().then(setSavedLocations).catch((e) => {
      console.warn('Failed to load saved locations:', e);
    });
    fetchDangerZones().then(setZones).catch((e) => {
      console.warn('Failed to load danger zones:', e);
    });
    fetchHeatmap().then(setHeatmap).catch(() => {});

    // Always return camera to current location when tab gains focus
    setSelectedId('current');
    const c = currentCoords;
    if (c) {
      cameraRef.current?.setStop({
        center: [c.longitude, c.latitude],
        zoom: DEFAULT_ZOOM, duration: 600, easing: 'fly',
      });
    }
  }, [currentCoords]));

  // Start GPS subscription
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let firstFix = true;

    requestLocationPermission().then((granted) => {
      setHasPermission(granted);
      if (!granted) return;

      unsub = subscribeToLocation((coords) => {
        setCurrentCoords(coords);
        if (firstFix) {
          firstFix = false;
          if (selectedId === 'current') {
            cameraRef.current?.setStop({
              center: [coords.longitude, coords.latitude],
              zoom: DEFAULT_ZOOM, duration: 800, easing: 'fly',
            });
          }
        }
        reverseGeocode(coords).then(setCurrentAddress).catch(() => {});
      });
    });

    return () => { unsub?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectLocation = useCallback((id: string, coords: [number, number]) => {
    setSelectedId(id);
    cameraRef.current?.setStop({
      center: coords, zoom: DEFAULT_ZOOM, duration: 700, easing: 'fly',
    });
  }, []);

  const handleRemove = useCallback((loc: SavedLocation) => {
    Alert.alert(
      i18n('location.saved.remove_title'),
      i18n('location.saved.remove_confirm', { name: loc.name }),
      [
        { text: i18n('common.cancel'), style: 'cancel' },
        {
          text: i18n('common.delete'), style: 'destructive',
          onPress: async () => {
            await removeSavedLocation(loc.id);
            setSavedLocations((prev) => prev.filter((l) => l.id !== loc.id));
            if (selectedId === loc.id) setSelectedId('current');
          },
        },
      ],
    );
  }, [selectedId, i18n]);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setSuggestions([]); return; }
    setSearchLoading(true);
    setSearchError(null);
    try {
      // Nominatim (OSM) returns streets, cities, municipalities — much richer than expo-location
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8&addressdetails=1&accept-language=en,pt`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'N4Safety-GuardianSphere/1.0' },
      });
      if (!res.ok) throw new Error('Search failed');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any[] = await res.json();
      if (!data.length) { setSuggestions([]); setSearchError(i18n('location.saved.no_results')); return; }

      const results = data.map((item) => {
        const addr = item.address ?? {};
        // Build a clean display name: primary label + context
        const primary = addr.road ?? addr.pedestrian ?? addr.retail ?? addr.leisure
          ?? addr.suburb ?? addr.neighbourhood ?? addr.village ?? addr.town
          ?? addr.city ?? addr.municipality ?? addr.county ?? item.name ?? query;
        const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county ?? '';
        const country = addr.country ?? '';
        const subtitle = [city, country].filter(Boolean).join(', ');
        return {
          name: primary,
          address: subtitle || item.display_name,
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        };
      });
      setSuggestions(results);
      setSearchError(null);
    } catch {
      setSearchError(i18n('location.saved.search_failed'));
    } finally {
      setSearchLoading(false);
    }
  }, [i18n]);

  const onSearchQueryChange = useCallback((text: string) => {
    setSearchQuery(text);
    setSearchError(null);
    // Don't wipe suggestions while typing — keep old results visible until new ones arrive
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(() => { void fetchSuggestions(text); }, 250);
  }, [fetchSuggestions]);

  const pickSuggestion = useCallback(async (s: { name: string; address: string; latitude: number; longitude: number }) => {
    const saved = await addSavedLocation(s);
    setSavedLocations((prev) => [...prev, saved]);
    selectLocation(saved.id, [s.longitude, s.latitude]);
    setSearchOpen(false);
    setSearchQuery('');
    setSuggestions([]);
  }, [selectLocation]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSuggestions([]);
    setSearchError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Map press handler — show area summary for pressed location
  const handleMapPress = useCallback(async (event: any) => {
    let lng: number;
    let lat: number;
    try {
      if (event?.geometry?.coordinates) {
        [lng, lat] = event.geometry.coordinates;
      } else if (event?.nativeEvent?.coordinates) {
        [lng, lat] = event.nativeEvent.coordinates;
      } else {
        return;
      }
    } catch { return; }

    if (lng === undefined || lat === undefined) return;

    setPressedCoords([lng, lat]);
    setAreaSummaryVisible(true);
    setAreaSummary(null);
    const summary = await fetchAreaSummary(lat, lng, 300);
    if (summary) setAreaSummary(summary);
  }, []);

  const cardProps = {
    accentColor: t.colors.accent,
    textColor: t.colors.text,
    mutedColor: t.colors.textMuted,
    glassBorder: t.colors.glassBorder,
    glass: t.colors.glass,
    blurTint: t.blurTint,
  };

  return (
    <View style={[styles.root, { backgroundColor: t.colors.bg }]}>

      {/* ── Card list ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: t.colors.bg }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.colors.text }]}>{i18n('location.saved.title')}</Text>
          <Pressable
            onPress={() => setSearchOpen(true)}
            style={[styles.addBtn, { backgroundColor: t.colors.accent }]}
          >
            <Plus color="#fff" size={20} strokeWidth={2.5} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardRow}
        >
          {/* Current Location card */}
          <LocationCard
            {...cardProps}
            name={i18n('location.saved.current_location')}
            subtitle={currentAddress}
            riskLevel="low"
            selected={selectedId === 'current'}
            onPress={() => {
              const c = currentCoords ?? { latitude: DEFAULT_CENTER[1], longitude: DEFAULT_CENTER[0] };
              selectLocation('current', [c.longitude, c.latitude]);
            }}
          />

          {/* Saved places */}
          {savedLocations.map((loc) => (
            <LocationCard
              {...cardProps}
              key={loc.id}
              name={loc.name}
              subtitle={loc.address}
              selected={selectedId === loc.id}
              removable
              onPress={() => selectLocation(loc.id, [loc.longitude, loc.latitude])}
              onRemove={() => handleRemove(loc)}
            />
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* ── Embedded map ── */}
      <View style={styles.mapWrap}>
        <Map
          style={StyleSheet.absoluteFill}
          mapStyle={STYLE_URL}
          logo={false}
          attribution={false}
          onPress={handleMapPress}
        >
          <Camera
            ref={cameraRef}
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
          />

          {hasPermission && <UserLocation animated heading />}

          {/* Admin reference zones — subtle background outlines only */}
          {zones && (
            <GeoJSONSource id="admin-zones" data={zones}>
              <Layer
                id="admin-zones-fill"
                type="fill"
                source="admin-zones"
                paint={{
                  'fill-color': FILL_COLOR as unknown as string,
                  'fill-opacity': 0.06,
                }}
              />
              <Layer
                id="admin-zones-outline"
                type="line"
                source="admin-zones"
                paint={{
                  'line-color': LINE_COLOR as unknown as string,
                  'line-width': 0.8,
                  'line-dasharray': [3, 3],
                }}
              />
            </GeoJSONSource>
          )}

          {/* Live crowd-sourced risk heatmap */}
          {heatmap && heatmap.features.length > 0 && (
            <GeoJSONSource id="risk-heatmap" data={heatmap}>
              <Layer
                id="heatmap-layer"
                type="heatmap"
                source="risk-heatmap"
                paint={{
                  'heatmap-weight': ['get', 'weight'],
                  'heatmap-intensity': 2.5,
                  // Glowing Orb Effect: Concentrated colors with high blur
                  'heatmap-color': ([
                    'interpolate', ['linear'], ['heatmap-density'],
                    0,    'rgba(0,0,0,0)',
                    0.2,  t.blurTint === 'dark' ? 'rgba(255, 59, 107, 0.6)' : 'rgba(255, 59, 107, 0.4)',
                    0.5,  t.blurTint === 'dark' ? 'rgba(255, 59, 107, 0.9)' : 'rgba(255, 59, 107, 0.7)',
                    1.0,  'rgba(255, 255, 255, 0.95)',
                  ] as Expression) as any,
                  'heatmap-radius': 60,
                  'heatmap-opacity': 0.8,
                }}
              />
            </GeoJSONSource>
          )}
        </Map>

        {/* Recenter button */}
        {hasPermission && currentCoords && (
          <Pressable
            onPress={() => selectLocation('current', [currentCoords.longitude, currentCoords.latitude])}
            style={styles.recenterBtn}
          >
            <BlurView intensity={55} tint={t.blurTint} style={styles.recenterInner}>
              <Navigation color={t.colors.text} size={18} strokeWidth={2.2} />
            </BlurView>
          </Pressable>
        )}

        {/* Location label pill */}
        <View style={[styles.mapLabel, { borderColor: t.colors.glassBorder }]} pointerEvents="none">
          <BlurView intensity={60} tint={t.blurTint} style={StyleSheet.absoluteFill} />
          <View style={[styles.mapLabelContent, { backgroundColor: t.colors.glass }]}>
            <MapPin color={t.colors.accent} size={13} strokeWidth={2.4} />
            <Text style={[styles.mapLabelText, { color: t.colors.text }]} numberOfLines={1}>
              {selectedId === 'current'
                ? currentAddress
                : savedLocations.find((l) => l.id === selectedId)?.name ?? ''}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Search modal ── */}
      <Modal visible={searchOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSearch}>
        <View style={[styles.searchModal, { backgroundColor: t.colors.bg }]}>
          <BlurView intensity={60} tint={t.blurTint} style={StyleSheet.absoluteFill} />
          <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            <View style={styles.searchContent}>
              {/* Input row */}
              <View style={[styles.searchRow, { backgroundColor: t.colors.glass, borderColor: t.colors.glassBorder }]}>
                <Search color={t.colors.textMuted} size={18} strokeWidth={2} />
                <TextInput
                  style={[styles.searchInput, { color: t.colors.text }]}
                  value={searchQuery}
                  onChangeText={onSearchQueryChange}
                  placeholder={i18n('location.saved.search_placeholder')}
                  placeholderTextColor={t.colors.textMuted}
                  autoFocus
                  returnKeyType="search"
                  onSubmitEditing={() => { void fetchSuggestions(searchQuery); }}
                />
                {searchLoading
                  ? <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: t.colors.textMuted, fontSize: 11 }}>…</Text>
                    </View>
                  : <Pressable onPress={closeSearch}><X color={t.colors.textMuted} size={20} strokeWidth={2} /></Pressable>
                }
              </View>

              {searchError ? (
                <Text style={[styles.searchError, { color: t.colors.accent }]}>{searchError}</Text>
              ) : null}

              {/* Live suggestion list — scrollable so 8 results don't overflow */}
              {suggestions.length > 0 && (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={{ flexGrow: 0 }}
                >
                  <View style={[styles.suggestionList, { borderColor: t.colors.glassBorder, backgroundColor: t.colors.glass }]}>
                    {suggestions.map((s, i) => (
                      <Pressable
                        key={`${s.latitude}-${s.longitude}-${i}`}
                        onPress={() => { void pickSuggestion(s); }}
                        style={({ pressed }) => [
                          styles.suggestionRow,
                          { borderTopWidth: i > 0 ? 1 : 0, borderTopColor: t.colors.divider },
                          pressed && { backgroundColor: t.colors.divider },
                        ]}
                      >
                        <MapPin size={14} color={t.colors.accent} strokeWidth={2.2} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.suggestionName, { color: t.colors.text }]} numberOfLines={1}>{s.name}</Text>
                          <Text style={[styles.suggestionAddr, { color: t.colors.textMuted }]} numberOfLines={1}>{s.address}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              )}

              {suggestions.length === 0 && !searchLoading && !searchError && searchQuery.trim().length > 0 && (
                <Text style={[styles.searchHint, { color: t.colors.textMuted }]}>{i18n('location.saved.search_hint')}</Text>
              )}
              {!searchQuery.trim() && (
                <Text style={[styles.searchHint, { color: t.colors.textMuted }]}>{i18n('location.saved.empty_search')}</Text>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ── Area Summary Modal (map press) ── */}
      <Modal visible={areaSummaryVisible} transparent animationType="slide" onRequestClose={() => setAreaSummaryVisible(false)}>
        <Pressable style={styles.asBackdrop} onPress={() => setAreaSummaryVisible(false)} />
        <View style={[styles.asDrawer, { borderColor: t.colors.glassBorder }]}>
          <BlurView intensity={65} tint={t.blurTint} style={StyleSheet.absoluteFill} />
          <View style={[styles.asContent, { backgroundColor: t.colors.glass }]}>
            <View style={styles.asHandle}>
              <View style={[styles.asHandleBar, { backgroundColor: t.colors.textMuted }]} />
            </View>
            <Text style={[styles.asTitle, { color: t.colors.text }]}>{i18n('map.area_summary_title')}</Text>

            {areaSummary ? (
              <>
                <View style={styles.asStatRow}>
                  <Text style={[styles.asStatLabel, { color: t.colors.textMuted }]}>
                    {i18n('map.reports_last_year', { count: areaSummary.totalReports, plural: areaSummary.totalReports !== 1 ? 's' : '' })}
                  </Text>
                  <Text style={[styles.asStatValue, { color: t.colors.text }]}>{areaSummary.totalReports}</Text>
                </View>
                <View style={styles.asStatRow}>
                  <Text style={[styles.asStatLabel, { color: t.colors.textMuted }]}>
                    {i18n('map.recent_24h', { count: areaSummary.recent24h })}
                  </Text>
                  <Text style={[styles.asStatValue, { color: areaSummary.recent24h > 0 ? t.colors.accent : t.colors.text }]}>{areaSummary.recent24h}</Text>
                </View>
                {areaSummary.riskiestHour != null && (
                  <View style={styles.asStatRow}>
                    <Text style={[styles.asStatLabel, { color: t.colors.textMuted }]}>
                      {i18n('map.riskiest_hour', { hour: areaSummary.riskiestHour })}
                    </Text>
                  </View>
                )}
                {areaSummary.topType && (
                  <View style={styles.asStatRow}>
                    <Text style={[styles.asStatLabel, { color: t.colors.textMuted }]}>Most common</Text>
                    <Text style={[styles.asStatValue, { color: t.colors.text }]}>{areaSummary.topType.replace('_', ' ')}</Text>
                  </View>
                )}
              </>
            ) : (
              <Text style={[styles.asEmpty, { color: t.colors.textMuted }]}>{i18n('map.no_reports')}</Text>
            )}

            {pressedCoords && (
              <Pressable
                onPress={() => {
                  setAreaSummaryVisible(false);
                  // The explore tab handles reports — navigate there
                }}
                style={[styles.asReportBtn, { backgroundColor: t.colors.accent }]}
              >
                <Text style={styles.asReportBtnText}>{i18n('map.report_here')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  title: { fontSize: 26, fontWeight: '800', fontFamily: FONT, letterSpacing: -0.4 },
  addBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },

  cardRow: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
    flexDirection: 'row',
  },
  card: {
    width: 180,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 8,
  },
  cardName: {
    fontFamily: FONT, fontSize: 14, fontWeight: '700',
  },
  cardSub: {
    fontFamily: FONT, fontSize: 12, marginTop: 3,
  },
  riskDot: {
    width: 10, height: 10, borderRadius: 5, flexShrink: 0,
  },
  removeBtn: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },

  mapWrap: { flex: 1, position: 'relative' },
  errorOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  errorOverlayText: {
    fontFamily: FONT,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  recenterBtn: {
    position: 'absolute', bottom: 110, right: 16,
  },
  recenterInner: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  mapLabel: {
    position: 'absolute', bottom: 110, left: 16,
    right: 70, borderRadius: 20, overflow: 'hidden', borderWidth: 1,
  },
  mapLabelContent: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, gap: 6,
  },
  mapLabelText: {
    fontFamily: FONT, fontSize: 13, fontWeight: '600', flex: 1,
  },

  // Search modal
  searchModal: { flex: 1 },
  searchContent: { padding: 16, gap: 10 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 16, fontFamily: FONT },
  searchError: { fontSize: 13, paddingHorizontal: 4, fontFamily: FONT },
  searchHint: { fontSize: 13, fontFamily: FONT, textAlign: 'center', marginTop: 24, paddingHorizontal: 20 },
  suggestionList: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  suggestionName: { fontFamily: FONT, fontSize: 15, fontWeight: '600' },
  suggestionAddr: { fontFamily: FONT, fontSize: 12, marginTop: 2 },

  // Area summary drawer
  asBackdrop: { flex: 1 },
  asDrawer: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden', borderWidth: 1, borderBottomWidth: 0,
    paddingBottom: 40,
  },
  asContent: { padding: 20, gap: 14 },
  asHandle: { alignItems: 'center', marginBottom: 4 },
  asHandleBar: { width: 36, height: 4, borderRadius: 2 },
  asTitle: { fontSize: 18, fontWeight: '800' },
  asStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  asStatLabel: { fontSize: 14, fontWeight: '500', flex: 1 },
  asStatValue: { fontSize: 16, fontWeight: '700' },
  asEmpty: { fontSize: 14, fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 },
  asReportBtn: {
    height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  asReportBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
