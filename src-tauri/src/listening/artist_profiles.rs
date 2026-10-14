use super::*;
use std::collections::HashSet;

#[derive(Clone, Debug)]
pub(super) struct ArtistProfile {
    pub id: Option<String>,
    pub name: String,
    pub disambiguation: Option<String>,
}

impl ArtistProfile {
    pub fn key(&self) -> String {
        self.id
            .clone()
            .unwrap_or_else(|| format!("unresolved:{}", crate::identity::artist_key(&self.name)))
    }
}

pub(super) struct ArtistProfiles {
    by_id: HashMap<String, ArtistProfile>,
    by_name: HashMap<String, Vec<String>>,
    album_profiles: HashMap<(String, String), HashSet<String>>,
}

impl ArtistProfiles {
    pub fn load(conn: &Connection) -> Result<Self> {
        let mut by_id = HashMap::new();
        let mut by_name: HashMap<String, Vec<String>> = HashMap::new();
        let mut statement =
            conn.prepare("SELECT id,display_artist,disambiguation FROM artist_identities")?;
        for row in statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })? {
            let (id, name, disambiguation) = row?;
            by_name
                .entry(crate::identity::artist_key(&name))
                .or_default()
                .push(id.clone());
            by_id.insert(
                id.clone(),
                ArtistProfile {
                    id: Some(id),
                    name,
                    disambiguation,
                },
            );
        }
        let mut album_profiles: HashMap<(String, String), HashSet<String>> = HashMap::new();
        let key = crate::identity::catalog_artist_key_sql("album_artist_display");
        let mut albums = conn.prepare(&format!(
            "SELECT album_artist_display,album,{key} FROM albums"
        ))?;
        for row in albums.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })? {
            let (name, album, id) = row?;
            album_profiles
                .entry((
                    crate::identity::artist_key(&name),
                    edition_title_key(&album),
                ))
                .or_default()
                .insert(id);
        }
        Ok(Self {
            by_id,
            by_name,
            album_profiles,
        })
    }

    pub fn album_identifies_artist(&self, name: &str, album_key: &str) -> bool {
        !album_key.is_empty()
            && self
                .album_profiles
                .get(&(crate::identity::artist_key(name), album_key.to_owned()))
                .is_some_and(|ids| ids.len() == 1)
    }

    pub fn ambiguous(&self, name: &str) -> bool {
        self.by_name
            .get(&crate::identity::artist_key(name))
            .is_some_and(|ids| ids.len() > 1)
    }

    pub fn for_track(
        &self,
        performer: &str,
        album_artist: &str,
        assigned_id: &str,
    ) -> ArtistProfile {
        let performer = if performer.trim().is_empty() {
            album_artist
        } else {
            performer
        };
        if crate::identity::artist_key(performer) == crate::identity::artist_key(album_artist) {
            if let Some(profile) = self.by_id.get(assigned_id) {
                return profile.clone();
            }
        }
        if let Some(ids) = self.by_name.get(&crate::identity::artist_key(performer)) {
            if ids.len() == 1 {
                return self.by_id[&ids[0]].clone();
            }
        }
        ArtistProfile {
            id: None,
            name: performer.into(),
            disambiguation: self
                .ambiguous(performer)
                .then(|| "Unresolved artist".into()),
        }
    }

    pub fn attach_rows(&self, conn: &Connection, rows: &mut [ListeningRow]) -> Result<()> {
        let key = crate::identity::catalog_artist_key_sql("album_artist_display");
        let mut track = conn.prepare(&format!("SELECT COALESCE(display_artist,''),COALESCE(album_artist_display,''),{key} FROM tracks WHERE id=?1"))?;
        let mut album = conn.prepare(&format!(
            "SELECT COALESCE(album_artist_display,''),{key} FROM albums WHERE id=?1"
        ))?;
        for row in rows {
            let profile = if let Some(id) = row.track_id {
                track
                    .query_row([id], |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                        ))
                    })
                    .optional()?
                    .map(|(performer, owner, key)| self.for_track(&performer, &owner, &key))
            } else if let Some(id) = row.album_id.as_deref() {
                album
                    .query_row([id], |r| {
                        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
                    })
                    .optional()?
                    .map(|(name, key)| self.for_track(&name, &name, &key))
            } else {
                None
            };
            if let Some(profile) = profile {
                row.artist = profile.name;
                row.artist_id = profile.id;
                row.artist_disambiguation = profile.disambiguation;
            } else if self.ambiguous(&row.artist) {
                row.artist_disambiguation = Some("Unresolved artist".into());
            }
        }
        Ok(())
    }

    pub fn top_artists(
        &self,
        conn: &Connection,
        since: i64,
        limit: u32,
    ) -> Result<Vec<ListeningRow>> {
        let key = crate::identity::catalog_artist_key_sql("t.album_artist_display");
        let mut statement=conn.prepare(&format!("{} SELECT COALESCE(t.display_artist,''),COALESCE(t.album_artist_display,''),{key},played.plays,played.last_played FROM played JOIN tracks t ON t.id=played.track_id",played_cte()))?;
        let mut grouped: HashMap<String, ListeningRow> = HashMap::new();
        for value in statement.query_map([since], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, Option<i64>>(4)?,
            ))
        })? {
            let (performer, owner, id, plays, last) = value?;
            let profile = self.for_track(&performer, &owner, &id);
            let row = grouped
                .entry(profile.key())
                .or_insert_with(|| ListeningRow {
                    key: profile.key(),
                    title: profile.name.clone(),
                    artist: profile.name,
                    artist_id: profile.id,
                    artist_disambiguation: profile.disambiguation,
                    album: None,
                    album_id: None,
                    track_id: None,
                    rating: None,
                    plays: 0,
                    last_played_at: None,
                    source: None,
                });
            row.plays += plays;
            row.last_played_at = row.last_played_at.max(last);
        }
        let mut rows: Vec<_> = grouped.into_values().collect();
        rows.sort_by(|a, b| {
            b.plays
                .cmp(&a.plays)
                .then(b.last_played_at.cmp(&a.last_played_at))
                .then(a.artist.cmp(&b.artist))
                .then(a.key.cmp(&b.key))
        });
        rows.truncate(limit as usize);
        Ok(rows)
    }
}
