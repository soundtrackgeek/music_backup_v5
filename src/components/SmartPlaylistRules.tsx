import { useState } from "react";
import { createRequest } from "../app/requests";
import { saveSmartPlaylist } from "../backend";
import type { BrowseRequest, SavedPlaylist } from "../types";

const textRules = [["albumArtist","Album artist"],["displayArtist","Track artist"],["albumTitle","Album title"],["trackTitle","Song title"],["publisher","Publisher"]] as const;

export function SmartPlaylistRules({ saved, onSaved, onCancel }: { saved?:SavedPlaylist; onSaved:(saved:SavedPlaylist)=>void; onCancel:()=>void }) {
  const [editRevision] = useState(saved?.updatedAt);
  const [name,setName]=useState(saved?.name??"");
  const [request,setRequest]=useState<BrowseRequest>(saved?.playlist.request??createRequest("tracks"));
  const [limit,setLimit]=useState(saved?.playlist.smartSettings?.trackLimit??1000);
  const [policy,setPolicy]=useState(saved?.playlist.smartSettings?.refreshPolicy??"library");
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  const update=(patch:Partial<BrowseRequest["filters"]>)=>setRequest(r=>({...r,filters:{...r.filters,...patch}}));
  const album=request.view==="albums";
  return <form className="smart-playlist-rules" aria-label="Shared Smart playlist rules" onSubmit={e=>{
    e.preventDefault();if(busy)return;setBusy(true);setError(null);
    void saveSmartPlaylist({id:saved?.id??null,expectedUpdatedAt:editRevision,name,request,settings:{trackLimit:limit,refreshPolicy:policy}}).then(onSaved).catch((reason:unknown)=>setError(String(reason))).finally(()=>setBusy(false));
  }}><h3>{saved?"Edit Smart rules":"Create Smart playlist"}</h3><p>These local rules are shared with Aurora. Existing advanced filters are retained when editing.</p>
    <fieldset disabled={busy}>
      <label>Name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} /></label>
      <label>Match<select value={request.view} onChange={e=>setRequest({...request,view:e.target.value as "tracks"|"albums"})}><option value="tracks">Songs</option><option value="albums">Albums — all their songs</option></select></label>
      <label>Match text<input maxLength={256} value={request.searchText} onChange={e=>setRequest({...request,searchText:e.target.value})} /></label>
      {textRules.map(([key,label])=>{const rule=request.filters[key];return <div key={key} className="playlist-text-rule"><label>{label}<input maxLength={256} value={rule.value} onChange={e=>update({[key]:{...rule,value:e.target.value}})} /></label><label>{label} comparison<select value={rule.operator} onChange={e=>update({[key]:{...rule,operator:e.target.value}})}><option value="contains">Contains</option><option value="equals">Equals</option><option value="startsWith">Starts with</option><option value="doesNotContain">Does not contain</option></select></label></div>;})}
      <label>Genres (comma separated)<input value={request.filters.genres.join(", ")} onChange={e=>update({genres:e.target.value.split(",").map(v=>v.trim()).filter(Boolean)})} /></label>
      <label>Minimum rating<input type="number" min={0} max={5} step={album?0.05:0.5} value={(album?request.filters.albumRatingMin==null?"":request.filters.albumRatingMin/20:request.filters.trackRatingMin)??""} onChange={e=>update(album?{albumRatingMin:e.target.value?Math.round(Number(e.target.value)*20):null}:{trackRatingMin:e.target.value?Number(e.target.value):null})} placeholder="Any" /></label>
      <label>Maximum rating<input type="number" min={0} max={5} step={album?0.05:0.5} value={(album?request.filters.albumRatingMax==null?"":request.filters.albumRatingMax/20:request.filters.trackRatingMax)??""} onChange={e=>update(album?{albumRatingMax:e.target.value?Math.round(Number(e.target.value)*20):null}:{trackRatingMax:e.target.value?Number(e.target.value):null})} placeholder="Any" /></label>
      <label>Original year from<input type="number" min={1} max={9999} value={request.filters.yearFrom??""} onChange={e=>update({yearFrom:e.target.value?Number(e.target.value):null})} /></label>
      <label>Original year to<input type="number" min={1} max={9999} value={request.filters.yearTo??""} onChange={e=>update({yearTo:e.target.value?Number(e.target.value):null})} /></label>
      <label>Sort<select value={request.sort.field} onChange={e=>setRequest({...request,sort:{...request.sort,field:e.target.value}})}>{Array.from(new Set([request.sort.field,"title","album","artist","year","releaseYear","added",album?"albumRating":"trackRating"])).map(s=><option key={s} value={s}>{s}</option>)}</select></label>
      <label>Direction<select value={request.sort.direction} onChange={e=>setRequest({...request,sort:{...request.sort,direction:e.target.value as "asc"|"desc"}})}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
      <label>Song limit<input type="number" min={1} max={10000} required value={limit} onChange={e=>setLimit(Number(e.target.value))} /></label>
      <label>Refresh<select value={policy} onChange={e=>setPolicy(e.target.value)}><option value="library">When the library changes / on open</option><option value="manual">Manual</option></select></label>
      <label><input type="checkbox" checked={(request.filters.lovedTracksMin??0)>0} onChange={e=>update({lovedTracksMin:e.target.checked?1:null})} />{album?"Albums with loved songs":"Loved songs only"}</label>
    </fieldset>{error&&<p role="alert" className="error-message">{error}</p>}<div className="playlist-result-actions"><button type="submit" className="primary-button" disabled={busy||!name.trim()}>{busy?"Saving…":"Save Smart playlist"}</button><button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}
