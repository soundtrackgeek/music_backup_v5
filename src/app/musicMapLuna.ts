import type { BrowseRequest, MusicMapLocationDetails } from "../types";
import { createRequest } from "./requests";

export function musicMapScopeLabel(details: MusicMapLocationDetails) {
  const { point } = details;
  return point.precision === "area" && point.countryName
    ? `${point.name}, ${point.countryName}`
    : point.name;
}

export function createMusicMapQuestionRequest(
  details: MusicMapLocationDetails,
): BrowseRequest {
  const request = createRequest("albums");
  request.limit = 50;

  if (details.point.precision === "country" && details.point.countryCode) {
    request.filters.originCountryCodes = [details.point.countryCode];
  } else {
    request.filters.artistKeys = details.artistKeys;
  }

  return request;
}
