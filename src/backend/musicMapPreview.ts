import type {
  MusicMapArtist,
  MusicMapLocationDetails,
  MusicMapPoint,
  MusicMapRefreshSummary,
  MusicMapResponse,
} from "../types";

function country(
  code: string,
  name: string,
  latitude: number,
  longitude: number,
  artistCount: number,
  topGenre: string,
): MusicMapPoint {
  return {
    id: `country:${code}`,
    name,
    countryCode: code,
    countryName: name,
    precision: "country",
    latitude,
    longitude,
    artistCount,
    albumCount: Math.round(artistCount * 3.4),
    trackCount: Math.round(artistCount * 34),
    lovedTracks: Math.round(artistCount * 4.8),
    topGenre,
  };
}

function area(
  id: string,
  name: string,
  countryCode: string,
  countryName: string,
  latitude: number,
  longitude: number,
  artistCount: number,
  topGenre: string,
): MusicMapPoint {
  return {
    id: `area:${id}`,
    name,
    countryCode,
    countryName,
    precision: "area",
    latitude,
    longitude,
    artistCount,
    albumCount: Math.round(artistCount * 3.8),
    trackCount: Math.round(artistCount * 38),
    lovedTracks: Math.round(artistCount * 5.1),
    topGenre,
  };
}

const countries = [
  country("US", "United States", 39.8, -98.6, 4560, "Rock"),
  country("GB", "United Kingdom", 54.2, -2.7, 2874, "Alternative"),
  country("NO", "Norway", 61.0, 8.1, 486, "Electronic"),
  country("SE", "Sweden", 62.0, 15.0, 624, "Pop"),
  country("DE", "Germany", 51.1, 10.4, 734, "Electronic"),
  country("FR", "France", 46.2, 2.2, 512, "Pop"),
  country("NL", "Netherlands", 52.2, 5.3, 348, "Electronic"),
  country("IS", "Iceland", 64.9, -18.6, 96, "Alternative"),
  country("FI", "Finland", 64.0, 26.0, 217, "Metal"),
  country("IT", "Italy", 42.8, 12.8, 228, "Soundtrack"),
  country("ES", "Spain", 40.4, -3.7, 194, "Pop"),
  country("CA", "Canada", 56.1, -106.3, 734, "Indie"),
  country("BR", "Brazil", -10.8, -52.9, 288, "Latin"),
  country("AR", "Argentina", -38.4, -63.6, 119, "Rock"),
  country("AU", "Australia", -25.3, 133.8, 493, "Rock"),
  country("NZ", "New Zealand", -41.5, 172.8, 112, "Indie"),
  country("JP", "Japan", 36.2, 138.3, 667, "Soundtrack"),
  country("KR", "South Korea", 36.5, 127.9, 236, "Pop"),
  country("ZA", "South Africa", -30.6, 22.9, 104, "Jazz"),
  country("NG", "Nigeria", 9.1, 8.7, 87, "Afrobeat"),
];

const areas = [
  area("oslo", "Oslo", "NO", "Norway", 59.9139, 10.7522, 208, "Electronic"),
  area("bergen", "Bergen", "NO", "Norway", 60.3913, 5.3221, 82, "Indie"),
  area("tromso", "Tromsø", "NO", "Norway", 69.6492, 18.9553, 34, "Ambient"),
  area("london", "London", "GB", "United Kingdom", 51.5072, -0.1276, 1042, "Alternative"),
  area("manchester", "Manchester", "GB", "United Kingdom", 53.4808, -2.2426, 348, "Rock"),
  area("glasgow", "Glasgow", "GB", "United Kingdom", 55.8642, -4.2518, 184, "Indie"),
  area("new-york", "New York", "US", "United States", 40.7128, -74.006, 721, "Hip-Hop"),
  area("los-angeles", "Los Angeles", "US", "United States", 34.0522, -118.2437, 664, "Rock"),
  area("detroit", "Detroit", "US", "United States", 42.3314, -83.0458, 267, "Soul"),
  area("seattle", "Seattle", "US", "United States", 47.6062, -122.3321, 198, "Alternative"),
  area("berlin", "Berlin", "DE", "Germany", 52.52, 13.405, 291, "Electronic"),
  area("stockholm", "Stockholm", "SE", "Sweden", 59.3293, 18.0686, 274, "Pop"),
  area("paris", "Paris", "FR", "France", 48.8566, 2.3522, 238, "Pop"),
  area("tokyo", "Tokyo", "JP", "Japan", 35.6762, 139.6503, 304, "Soundtrack"),
  area("melbourne", "Melbourne", "AU", "Australia", -37.8136, 144.9631, 146, "Indie"),
];

export const mockMusicMap: MusicMapResponse = {
  summary: {
    totalArtists: 19_190,
    mappedArtists: 16_885,
    preciseArtistCount: 12_911,
    countryFallbackArtistCount: 3_974,
    areaCount: 2_914,
    countryCount: 107,
    unresolvedArtistCount: 2_305,
    candidateAreaCount: 2_914,
    lastRefreshedAt: "2026-07-25T12:00:00Z",
    needsRefresh: false,
  },
  countries,
  areas,
  generatedAt: "2026-07-25T12:00:00Z",
};

const previewArtists: MusicMapArtist[] = [
  {
    artistKey: "royksopp",
    name: "Röyksopp",
    albumCount: 13,
    trackCount: 168,
    lovedTracks: 42,
    topGenre: "Electronic",
    representativeAlbumId: "preview-royksopp",
    representativeAlbumTitle: "Melody A.M.",
    coverPath: null,
  },
  {
    artistKey: "susanne-sundfor",
    name: "Susanne Sundfør",
    albumCount: 10,
    trackCount: 121,
    lovedTracks: 31,
    topGenre: "Art Pop",
    representativeAlbumId: "preview-sundfor",
    representativeAlbumTitle: "Ten Love Songs",
    coverPath: null,
  },
  {
    artistKey: "a-ha",
    name: "a-ha",
    albumCount: 17,
    trackCount: 214,
    lovedTracks: 29,
    topGenre: "Synthpop",
    representativeAlbumId: "preview-aha",
    representativeAlbumTitle: "Hunting High and Low",
    coverPath: null,
  },
  {
    artistKey: "biosphere",
    name: "Biosphere",
    albumCount: 19,
    trackCount: 247,
    lovedTracks: 25,
    topGenre: "Ambient",
    representativeAlbumId: "preview-biosphere",
    representativeAlbumTitle: "Substrata",
    coverPath: null,
  },
];

export function mockMusicMapDetails(locationKey: string): MusicMapLocationDetails {
  const point =
    [...areas, ...countries].find((candidate) => candidate.id === locationKey) ??
    areas[0];
  const artists =
    point.id === "area:oslo"
      ? previewArtists
      : previewArtists.map((artist, index) => ({
          ...artist,
          artistKey: `${artist.artistKey}-${point.id}-${index}`,
        }));
  const supportingGenre =
    point.topGenre === "Electronic" ? "Alternative" : "Electronic";

  return {
    point,
    genres: [
      {
        genre: point.topGenre,
        albumCount: Math.round(point.albumCount * 0.43),
        artistCount: Math.round(point.artistCount * 0.39),
        percentage: 43,
      },
      {
        genre: supportingGenre,
        albumCount: Math.round(point.albumCount * 0.24),
        artistCount: Math.round(point.artistCount * 0.22),
        percentage: 24,
      },
      {
        genre: "Pop",
        albumCount: Math.round(point.albumCount * 0.17),
        artistCount: Math.round(point.artistCount * 0.16),
        percentage: 17,
      },
      {
        genre: "Other",
        albumCount: Math.round(point.albumCount * 0.16),
        artistCount: Math.round(point.artistCount * 0.23),
        percentage: 16,
      },
    ],
    artistKeys: artists.map((artist) => artist.artistKey),
    artists,
  };
}

export const mockMusicMapRefresh: MusicMapRefreshSummary = {
  candidateAreas: 2_914,
  resolvedAreas: 2_879,
  candidateCountries: 107,
  resolvedCountries: 107,
  unresolvedLocations: 35,
  fetchedAt: "2026-07-25T12:00:00Z",
};
