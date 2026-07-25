import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronRight,
  Compass,
  Crosshair,
  Disc3,
  Globe2,
  Heart,
  LoaderCircle,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  UsersRound,
} from "lucide-react";
import {
  AttributionControl,
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
  Map as MapLibre,
  NavigationControl,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  getAlbumCoverDataUrl,
  getMusicMap,
  getMusicMapLocationDetails,
  refreshMusicMapLocations,
} from "../backend";
import { formatNumber } from "../app/display";
import {
  geographyVisibility,
  genreColor,
  mapMetricValue,
  topGenreLegend,
  type MusicMapGeography,
  type MusicMapMetric,
} from "../app/musicMap";
import type {
  MusicMapArtist,
  MusicMapLocationDetails,
  MusicMapPoint,
  MusicMapResponse,
} from "../types";

const COUNTRY_SOURCE_ID = "music-map-countries";
const AREA_SOURCE_ID = "music-map-areas";
const COUNTRY_LAYER_IDS = ["music-map-country-circles", "music-map-country-labels"];
const AREA_LAYER_IDS = [
  "music-map-area-clusters",
  "music-map-area-cluster-count",
  "music-map-area-circles",
  "music-map-area-labels",
];

const musicMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    "natural-earth": {
      type: "raster",
      tiles: [
        "https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 6,
      attribution: "OpenFreeMap · OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "music-map-background",
      type: "background",
      paint: { "background-color": "#0d1820" },
    },
    {
      id: "music-map-basemap",
      type: "raster",
      source: "natural-earth",
      paint: {
        "raster-opacity": 0.82,
        "raster-saturation": -0.42,
        "raster-contrast": 0.08,
        "raster-brightness-min": 0.12,
        "raster-brightness-max": 0.62,
      },
    },
  ],
};

type MusicMapWorkspaceProps = {
  onOpenArtist: (artistKey: string, name: string) => void;
};

type MapPointProperties = {
  id: string;
  name: string;
  countryName: string;
  precision: MusicMapPoint["precision"];
  artistCount: number;
  albumCount: number;
  lovedTracks: number;
  metricValue: number;
  topGenre: string;
  color: string;
};

function pointCollection(points: MusicMapPoint[], metric: MusicMapMetric) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((point) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [point.longitude, point.latitude],
      },
      properties: {
        id: point.id,
        name: point.name,
        countryName: point.countryName ?? point.name,
        precision: point.precision,
        artistCount: point.artistCount,
        albumCount: point.albumCount,
        lovedTracks: point.lovedTracks,
        metricValue: mapMetricValue(point, metric),
        topGenre: point.topGenre,
        color: genreColor(point.topGenre),
      } satisfies MapPointProperties,
    })),
  };
}

function propertiesFromEvent(event: MapLayerMouseEvent) {
  const properties = event.features?.[0]?.properties;
  if (!properties || typeof properties.id !== "string") {
    return null;
  }
  return properties as MapPointProperties;
}

export function MusicMapWorkspace({ onOpenArtist }: MusicMapWorkspaceProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectLocationRef = useRef<(locationKey: string) => void>(() => {});
  const [data, setData] = useState<MusicMapResponse | null>(null);
  const [details, setDetails] = useState<MusicMapLocationDetails | null>(null);
  const [metric, setMetric] = useState<MusicMapMetric>("artistCount");
  const [geography, setGeography] = useState<MusicMapGeography>("auto");
  const [zoom, setZoom] = useState(0.75);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const loadMapData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getMusicMap();
      setData(response);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The music map could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMapData();
  }, [loadMapData]);

  const selectLocation = useCallback(async (locationKey: string) => {
    setIsDetailLoading(true);
    try {
      setDetails(await getMusicMapLocationDetails(locationKey));
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : "The location details could not be loaded.",
      );
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  selectLocationRef.current = (locationKey) => {
    void selectLocation(locationKey);
  };

  useEffect(() => {
    if (!data || details || !data.countries.length) {
      return;
    }
    const initialPoint =
      data.areas.find((point) => point.name === "Oslo") ?? data.countries[0];
    void selectLocation(initialPoint.id);
  }, [data, details, selectLocation]);

  useEffect(() => {
    if (!data || !mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new MapLibre({
      container: mapContainerRef.current,
      style: musicMapStyle,
      center: [5, 18],
      zoom: 0.75,
      minZoom: 0.5,
      maxZoom: 14,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(
      new NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new AttributionControl({ compact: true }),
      "bottom-left",
    );

    map.on("load", () => {
      try {
        map.addSource(COUNTRY_SOURCE_ID, {
        type: "geojson",
        data: pointCollection(data.countries, metric),
      });
      map.addSource(AREA_SOURCE_ID, {
        type: "geojson",
        data: pointCollection(data.areas, metric),
        cluster: true,
        clusterMaxZoom: 8,
        clusterRadius: 36,
      });
      map.addLayer({
        id: "music-map-country-circles",
        type: "circle",
        source: COUNTRY_SOURCE_ID,
        paint: {
          "circle-color": ["to-color", ["get", "color"]],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["to-number", ["get", "metricValue"]],
            1,
            5,
            500,
            12,
            5000,
            22,
          ],
          "circle-stroke-color": "#f7fffdd9",
          "circle-stroke-width": 1.2,
          "circle-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "music-map-country-labels",
        type: "symbol",
        source: COUNTRY_SOURCE_ID,
        minzoom: 1.5,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.55],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#f5faf8",
          "text-halo-color": "#111d23",
          "text-halo-width": 1.2,
        },
      });
      map.addLayer({
        id: "music-map-area-clusters",
        type: "circle",
        source: AREA_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#d7fff2",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            13,
            10,
            17,
            50,
            22,
          ],
          "circle-stroke-color": "#27443e",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "music-map-area-cluster-count",
        type: "symbol",
        source: AREA_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 11,
        },
        paint: { "text-color": "#17352f" },
      });
      map.addLayer({
        id: "music-map-area-circles",
        type: "circle",
        source: AREA_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["to-color", ["get", "color"]],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["to-number", ["get", "metricValue"]],
            1,
            5,
            50,
            9,
            1000,
            16,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.4,
        },
      });
      map.addLayer({
        id: "music-map-area-labels",
        type: "symbol",
        source: AREA_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        minzoom: 5,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.45],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#f5faf8",
          "text-halo-color": "#111d23",
          "text-halo-width": 1.2,
        },
      });

      const openFeature = (event: MapLayerMouseEvent) => {
        const properties = propertiesFromEvent(event);
        if (!properties) return;
        selectLocationRef.current(properties.id);
        map.flyTo({
          center: event.lngLat,
          zoom: Math.max(map.getZoom(), properties.precision === "country" ? 4 : 7),
          duration: 850,
        });
      };
      map.on("click", "music-map-country-circles", openFeature);
      map.on("click", "music-map-area-circles", openFeature);
      map.on("click", "music-map-area-clusters", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const clusterId = feature.properties?.cluster_id;
        const coordinates = feature.geometry.coordinates as [number, number];
        const source = map.getSource(AREA_SOURCE_ID) as GeoJSONSource;
        void source
          .getClusterExpansionZoom(clusterId)
          .then((expansionZoom) => {
            map.easeTo({
              center: coordinates,
              zoom: expansionZoom,
            });
          });
      });
      for (const layerId of [
        "music-map-country-circles",
        "music-map-area-circles",
        "music-map-area-clusters",
      ]) {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }
        setMapReady(true);
      } catch (layerError) {
        setError(
          layerError instanceof Error
            ? `The geography layers could not be drawn: ${layerError.message}`
            : "The geography layers could not be drawn.",
        );
      }
    });
    map.on("zoom", () => setZoom(map.getZoom()));

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [data, metric]);

  useEffect(() => {
    const map = mapRef.current;
    if (!data || !map || !mapReady) return;
    (map.getSource(COUNTRY_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      pointCollection(data.countries, metric),
    );
    (map.getSource(AREA_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      pointCollection(data.areas, metric),
    );
  }, [data, mapReady, metric]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const applyVisibility = () => {
      if (!map.isStyleLoaded()) {
        map.once("idle", applyVisibility);
        return;
      }
      const visible = geographyVisibility(geography, zoom);
      for (const layerId of COUNTRY_LAYER_IDS) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(
            layerId,
            "visibility",
            visible.countries ? "visible" : "none",
          );
        }
      }
      for (const layerId of AREA_LAYER_IDS) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(
            layerId,
            "visibility",
            visible.areas ? "visible" : "none",
          );
        }
      }
    };
    applyVisibility();
  }, [geography, mapReady, zoom]);

  const allPoints = useMemo(
    () => (data ? [...data.countries, ...data.areas] : []),
    [data],
  );
  const searchResults = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return [];
    return allPoints
      .filter((point) =>
        [point.name, point.countryName, point.topGenre]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query)),
      )
      .slice(0, 6);
  }, [allPoints, searchText]);
  const legend = useMemo(
    () =>
      topGenreLegend(
        geography === "areas" || (geography === "auto" && zoom >= 4.6)
          ? data?.areas ?? []
          : data?.countries ?? [],
      ),
    [data, geography, zoom],
  );

  function focusPoint(point: MusicMapPoint) {
    setSearchText("");
    void selectLocation(point.id);
    mapRef.current?.flyTo({
      center: [point.longitude, point.latitude],
      zoom: point.precision === "area" ? 8 : 4.5,
      duration: 900,
    });
  }

  async function refreshLocations() {
    setIsRefreshing(true);
    setError(null);
    try {
      await refreshMusicMapLocations();
      await loadMapData();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Map location enrichment failed.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <main className="workspace music-map-workspace">
      <header className="topbar music-map-topbar">
        <div>
          <p className="eyebrow">Library geography</p>
          <h1>Music Map</h1>
          <p>See where your library comes from</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void refreshLocations()}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <LoaderCircle aria-hidden="true" className="spin" size={16} />
          ) : (
            <RefreshCw aria-hidden="true" size={16} />
          )}
          {data?.summary.lastRefreshedAt ? "Refresh places" : "Enrich places"}
        </button>
      </header>

      <section className="metric-grid music-map-metrics" aria-label="Music map summary">
        <MapMetric
          icon={UsersRound}
          label="Mapped artists"
          value={data?.summary.mappedArtists}
          note={
            data
              ? `${Math.round((data.summary.mappedArtists / Math.max(1, data.summary.totalArtists)) * 100)}% of library`
              : undefined
          }
        />
        <MapMetric
          icon={LocateFixed}
          label="Precise artists"
          value={data?.summary.preciseArtistCount}
          note="MusicBrainz area"
        />
        <MapMetric
          icon={Globe2}
          label="Countries"
          value={data?.summary.countryCount}
          note="Country totals"
        />
        <MapMetric
          icon={MapPin}
          label="Areas"
          value={data?.summary.areaCount}
          note="Appear as you zoom"
        />
      </section>

      <section className="music-map-toolbar" aria-label="Map controls">
        <div className="music-map-search-shell">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="Search places or genres"
            placeholder="Search countries, areas, or genres"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          {searchResults.length > 0 ? (
            <div className="music-map-search-results" role="listbox">
              {searchResults.map((point) => (
                <button
                  key={point.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => focusPoint(point)}
                >
                  <span>
                    <strong>{point.name}</strong>
                    <small>
                      {point.precision === "area"
                        ? point.countryName
                        : `${formatNumber(point.artistCount)} artists`}
                    </small>
                  </span>
                  <span className="music-map-search-genre">
                    <i style={{ background: genreColor(point.topGenre) }} />
                    {point.topGenre}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="music-map-control-group" aria-label="Circle size">
          <span>Size</span>
          {(
            [
              ["artistCount", "Artists"],
              ["albumCount", "Albums"],
              ["lovedTracks", "Loved"],
            ] as const
          ).map(([value, label]) => (
            <button
              className={metric === value ? "active" : ""}
              key={value}
              type="button"
              aria-pressed={metric === value}
              onClick={() => setMetric(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="music-map-control-group" aria-label="Geography layer">
          <span>Layer</span>
          {(
            [
              ["auto", "Auto"],
              ["countries", "Countries"],
              ["areas", "Areas"],
            ] as const
          ).map(([value, label]) => (
            <button
              className={geography === value ? "active" : ""}
              key={value}
              type="button"
              aria-pressed={geography === value}
              onClick={() => setGeography(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div className="music-map-notice" role="alert">
          <Compass aria-hidden="true" size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => void loadMapData()}>
            Try again
          </button>
        </div>
      ) : null}

      <section className="music-map-stage">
        <div className="music-map-canvas-shell">
          <div
            className="music-map-canvas"
            ref={mapContainerRef}
            data-testid="music-map-canvas"
            aria-label="Interactive map of artist origins"
          />
          {isLoading ? (
            <div className="music-map-loading">
              <LoaderCircle aria-hidden="true" className="spin" size={22} />
              Mapping your library…
            </div>
          ) : null}
          <div className="music-map-layer-note">
            <Crosshair aria-hidden="true" size={14} />
            {geography === "auto"
              ? zoom < 2.5
                ? "Zoom in to reveal MusicBrainz areas"
                : zoom < 4.6
                  ? "Countries + precise areas"
                  : "Precise MusicBrainz areas"
              : geography === "areas"
                ? "Precise MusicBrainz areas"
                : "Country totals"}
          </div>
          <div className="music-map-legend" aria-label="Dominant genre legend">
            <strong>Biggest genre</strong>
            {legend.map((item) => (
              <span key={item.genre}>
                <i style={{ background: item.color }} />
                {item.genre}
              </span>
            ))}
          </div>
        </div>

        <aside
          className="music-map-inspector"
          data-testid="music-map-location-inspector"
          aria-label="Selected map location"
        >
          {isDetailLoading && !details ? (
            <div className="music-map-inspector-empty">
              <LoaderCircle aria-hidden="true" className="spin" size={22} />
              Loading location…
            </div>
          ) : details ? (
            <LocationInspector details={details} onOpenArtist={onOpenArtist} />
          ) : (
            <div className="music-map-inspector-empty">
              <MapPin aria-hidden="true" size={26} />
              <strong>Select a country or area</strong>
              <span>Explore its genres and artists.</span>
            </div>
          )}
        </aside>
      </section>

      {data?.summary.needsRefresh ? (
        <p className="music-map-footnote">
          {formatNumber(data.summary.candidateAreaCount - data.summary.areaCount)}{" "}
          MusicBrainz areas still need coordinates. Country totals remain available.
        </p>
      ) : null}
    </main>
  );
}

function MapMetric({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number | undefined;
  note?: string;
}) {
  return (
    <article className="metric music-map-metric">
      <span className="metric-icon">
        <Icon aria-hidden="true" size={18} />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value == null ? "—" : formatNumber(value)}</strong>
        {note ? <small>{note}</small> : null}
      </div>
    </article>
  );
}

function LocationInspector({
  details,
  onOpenArtist,
}: {
  details: MusicMapLocationDetails;
  onOpenArtist: MusicMapWorkspaceProps["onOpenArtist"];
}) {
  const { point } = details;
  return (
    <>
      <header className="music-map-inspector-header">
        <span className="music-map-pin">
          <MapPin aria-hidden="true" size={18} />
        </span>
        <div>
          <p>{point.precision === "area" ? point.countryName : "Country total"}</p>
          <h2>{point.name}</h2>
        </div>
        <span className="music-map-precision">
          {point.precision === "area" ? "Precise area" : "Country"}
        </span>
      </header>

      <div className="music-map-location-stats">
        <span>
          <strong>{formatNumber(point.artistCount)}</strong>
          artists
        </span>
        <span>
          <strong>{formatNumber(point.albumCount)}</strong>
          albums
        </span>
        <span>
          <strong>{formatNumber(point.lovedTracks)}</strong>
          loved
        </span>
      </div>

      <section className="music-map-genre-breakdown">
        <div className="music-map-section-heading">
          <div>
            <p>Biggest genre</p>
            <h3>{point.topGenre}</h3>
          </div>
          <Disc3
            aria-hidden="true"
            size={20}
            style={{ color: genreColor(point.topGenre) }}
          />
        </div>
        {details.genres.slice(0, 5).map((genre) => (
          <div className="music-map-genre-row" key={genre.genre}>
            <div>
              <span>{genre.genre}</span>
              <small>{formatNumber(genre.albumCount)} albums</small>
            </div>
            <div className="music-map-genre-track">
              <i
                style={{
                  width: `${Math.max(3, genre.percentage)}%`,
                  background: genreColor(genre.genre),
                }}
              />
            </div>
            <strong>{Math.round(genre.percentage)}%</strong>
          </div>
        ))}
      </section>

      <section className="music-map-artists">
        <div className="music-map-section-heading">
          <div>
            <p>From this {point.precision}</p>
            <h3>Representative artists</h3>
          </div>
        </div>
        <div className="music-map-artist-list">
          {details.artists.map((artist) => (
            <ArtistRow
              artist={artist}
              key={artist.artistKey}
              onOpenArtist={onOpenArtist}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function ArtistRow({
  artist,
  onOpenArtist,
}: {
  artist: MusicMapArtist;
  onOpenArtist: MusicMapWorkspaceProps["onOpenArtist"];
}) {
  const [cover, setCover] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!artist.representativeAlbumId) return;
    void getAlbumCoverDataUrl(artist.representativeAlbumId).then((value) => {
      if (!cancelled) setCover(value);
    });
    return () => {
      cancelled = true;
    };
  }, [artist.representativeAlbumId]);

  return (
    <button
      type="button"
      onClick={() => onOpenArtist(artist.artistKey, artist.name)}
    >
      <span className="music-map-artist-cover">
        {cover ? (
          <img src={cover} alt="" />
        ) : (
          <Disc3 aria-hidden="true" size={17} />
        )}
      </span>
      <span className="music-map-artist-copy">
        <strong>{artist.name}</strong>
        <small>
          {artist.topGenre} · {formatNumber(artist.albumCount)} albums
        </small>
      </span>
      <span className="music-map-loved">
        <Heart aria-hidden="true" size={12} />
        {formatNumber(artist.lovedTracks)}
      </span>
      <ChevronRight aria-hidden="true" size={15} />
    </button>
  );
}
