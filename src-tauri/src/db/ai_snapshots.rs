use super::*;

pub(super) fn validate_ai_snapshot_kind(kind: &str) -> Result<()> {
    if matches!(
        kind,
        "search" | "chart" | "searchAnswer" | "chartAnswer" | "libraryAnalysis" | "musicResearch"
    ) {
        Ok(())
    } else {
        bail!("Unsupported Luna snapshot type: {kind}")
    }
}

pub(super) fn validate_ai_snapshot_content(content: &AiSnapshotContent) -> Result<()> {
    let (prompt, prompt_limit) = match content {
        AiSnapshotContent::Search {
            prompt,
            result,
            answer,
            exchanges,
        } => {
            if result.target != "search" || result.chart_config.is_some() {
                bail!("The saved Luna search payload is inconsistent")
            }
            if answer
                .as_ref()
                .is_some_and(|saved_answer| saved_answer.view != result.request.view)
            {
                bail!("The saved Luna search answer payload is inconsistent")
            }
            validate_ai_query_exchanges(exchanges, "search", prompt, result, answer.as_ref())?;
            (prompt, 2_000)
        }
        AiSnapshotContent::Chart {
            prompt,
            result,
            answer,
            exchanges,
        } => {
            if result.target != "chart" || result.chart_config.is_none() {
                bail!("The saved Luna chart payload is inconsistent")
            }
            if answer
                .as_ref()
                .is_some_and(|saved_answer| saved_answer.view != result.request.view)
            {
                bail!("The saved Luna chart answer payload is inconsistent")
            }
            validate_ai_query_exchanges(exchanges, "chart", prompt, result, answer.as_ref())?;
            (prompt, 2_000)
        }
        AiSnapshotContent::SearchAnswer {
            prompt,
            request,
            result,
        }
        | AiSnapshotContent::ChartAnswer {
            prompt,
            request,
            result,
        } => {
            if result.view != request.view {
                bail!("The saved Luna current-view answer payload is inconsistent")
            }
            (prompt, 2_000)
        }
        AiSnapshotContent::LibraryAnalysis { prompt, result } => {
            if !matches!(
                result.lens.as_str(),
                "overview" | "ratingBacklog" | "tasteProfile" | "catalogBalance" | "metadataHealth"
            ) {
                bail!("The saved Luna analyst payload has an unsupported lens")
            }
            (prompt, 2_000)
        }
        AiSnapshotContent::MusicResearch {
            prompt,
            context,
            exchanges,
        } => {
            crate::ai::validate_music_research_context(context.clone())?;
            if exchanges.is_empty() || exchanges.len() > 5 {
                bail!("A saved music-research conversation must contain one to five exchanges")
            }
            for exchange in exchanges {
                let question = exchange.question.trim();
                if question.is_empty() || question.chars().count() > 4_000 {
                    bail!("A saved music-research question is empty or too long")
                }
                let result = &exchange.result;
                if result.answer.trim().is_empty() || result.answer.chars().count() > 12_000 {
                    bail!("A saved music-research answer is empty or too long")
                }
                if result.model.trim().is_empty() || result.model.chars().count() > 80 {
                    bail!("A saved music-research answer has an invalid model label")
                }
                if result.sources.len() > 12 || result.local_inspection_count > 20 {
                    bail!("A saved music-research answer exceeds its bounded tool limits")
                }
                for source in &result.sources {
                    if source.title.trim().is_empty()
                        || source.title.chars().count() > 180
                        || !source.url.starts_with("https://")
                        || source.url.chars().count() > 2_000
                    {
                        bail!("A saved music-research answer contains an invalid source")
                    }
                }
            }
            if exchanges
                .last()
                .map(|exchange| exchange.question.trim() != prompt.trim())
                .unwrap_or(true)
            {
                bail!("The saved music-research prompt does not match its latest exchange")
            }
            (prompt, 4_000)
        }
    };

    if prompt.chars().count() > prompt_limit {
        bail!("The Luna snapshot prompt is too long")
    }
    if !matches!(content, AiSnapshotContent::LibraryAnalysis { .. }) && prompt.trim().is_empty() {
        bail!("A Luna snapshot requires its original prompt")
    }
    Ok(())
}

pub(super) fn validate_ai_query_exchanges(
    exchanges: &[crate::ai::AiQueryExchange],
    target: &str,
    latest_prompt: &str,
    latest_result: &crate::ai::AiCompiledQuery,
    latest_answer: Option<&crate::ai::AiCurrentViewAnswer>,
) -> Result<()> {
    if exchanges.len() > 5 {
        bail!("A saved Luna query conversation cannot exceed five exchanges")
    }
    for exchange in exchanges {
        if exchange.prompt.trim().is_empty() || exchange.prompt.chars().count() > 2_000 {
            bail!("A saved Luna query conversation contains an invalid question")
        }
        if exchange.result.target != target
            || (target == "chart") != exchange.result.chart_config.is_some()
        {
            bail!("A saved Luna query conversation is inconsistent")
        }
        if exchange
            .answer
            .as_ref()
            .is_some_and(|answer| answer.view != exchange.result.request.view)
        {
            bail!("A saved Luna query conversation answer is inconsistent")
        }
        if exchange.answer.as_ref().is_some_and(|answer| {
            answer.answer.trim().is_empty() || answer.answer.chars().count() > 12_000
        }) {
            bail!("A saved Luna query conversation contains an invalid answer")
        }
    }
    if let Some(last) = exchanges.last() {
        if last.prompt != latest_prompt
            || last.result.target != latest_result.target
            || last.result.summary != latest_result.summary
            || last.result.request.view != latest_result.request.view
            || last.answer.is_some() != latest_answer.is_some()
        {
            bail!("The latest saved Luna query exchange is inconsistent")
        }
    }
    Ok(())
}

pub(super) fn current_library_snapshot_state(
    conn: &Connection,
) -> Result<(Option<i64>, Option<String>, i64, i64)> {
    let latest_import = conn
        .query_row(
            "
            SELECT id, completed_at, album_count, track_rows
            FROM import_runs
            WHERE status = 'completed'
            ORDER BY COALESCE(completed_at, started_at) DESC, id DESC
            LIMIT 1
            ",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()
        .context("Could not read the current library import for a Luna snapshot")?;

    if let Some((id, imported_at, album_count, track_count)) = latest_import {
        return Ok((Some(id), imported_at, album_count, track_count));
    }

    let album_count = conn
        .query_row("SELECT COUNT(*) FROM albums", [], |row| row.get(0))
        .context("Could not count albums for a Luna snapshot")?;
    let track_count = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
        .context("Could not count tracks for a Luna snapshot")?;
    Ok((None, None, album_count, track_count))
}

pub(super) fn ai_snapshot_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiSnapshot> {
    let content_json: String = row.get(3)?;
    let content = serde_json::from_str::<AiSnapshotContent>(&content_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(error))
    })?;

    Ok(AiSnapshot {
        id: row.get(0)?,
        title: row.get(2)?,
        content,
        library_import_run_id: row.get(4)?,
        library_imported_at: row.get(5)?,
        library_album_count: row.get(6)?,
        library_track_count: row.get(7)?,
        created_at: row.get(8)?,
    })
}

pub(super) fn load_ai_snapshot(conn: &Connection, id: i64) -> Result<AiSnapshot> {
    conn.query_row(
        "
        SELECT id, kind, title, content_json, library_import_run_id,
               library_imported_at, library_album_count, library_track_count, created_at
        FROM ai_snapshots
        WHERE id = ?1
        ",
        params![id],
        ai_snapshot_from_row,
    )
    .with_context(|| format!("Could not load Luna snapshot {id}"))
}

pub(super) fn list_ai_snapshots(conn: &Connection, kind: Option<&str>) -> Result<Vec<AiSnapshot>> {
    if let Some(kind) = kind {
        validate_ai_snapshot_kind(kind)?;
    }
    let mut stmt = conn.prepare(
        "
        SELECT id, kind, title, content_json, library_import_run_id,
               library_imported_at, library_album_count, library_track_count, created_at
        FROM ai_snapshots
        WHERE (?1 IS NULL OR kind = ?1)
        ORDER BY created_at DESC, id DESC
        ",
    )?;
    let snapshots = stmt
        .query_map(params![kind], ai_snapshot_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(snapshots)
}

pub(super) fn save_ai_snapshot(
    conn: &Connection,
    input: SaveAiSnapshotRequest,
) -> Result<AiSnapshot> {
    let title = input.title.trim();
    if title.is_empty() {
        bail!("A Luna snapshot needs a title")
    }
    if title.chars().count() > 160 {
        bail!("Luna snapshot titles cannot exceed 160 characters")
    }
    validate_ai_snapshot_content(&input.content)?;

    let kind = input.content.kind();
    let content_json =
        serde_json::to_string(&input.content).context("Could not serialize Luna snapshot")?;
    if content_json.len() > 1_000_000 {
        bail!("The Luna snapshot is too large to save")
    }
    let (import_run_id, imported_at, album_count, track_count) =
        current_library_snapshot_state(conn)?;
    let created_at = Utc::now().to_rfc3339();
    conn.execute(
        "
        INSERT INTO ai_snapshots (
            kind, title, content_json, library_import_run_id, library_imported_at,
            library_album_count, library_track_count, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ",
        params![
            kind,
            title,
            content_json,
            import_run_id,
            imported_at,
            album_count,
            track_count,
            created_at
        ],
    )
    .context("Could not save Luna snapshot")?;
    load_ai_snapshot(conn, conn.last_insert_rowid())
}

pub(super) fn delete_ai_snapshot(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM ai_snapshots WHERE id = ?1", params![id])
        .with_context(|| format!("Could not delete Luna snapshot {id}"))?;
    Ok(())
}

#[cfg(not(test))]
pub fn list_ai_snapshots_for_app(app: &AppHandle, kind: Option<String>) -> Result<Vec<AiSnapshot>> {
    let (conn, _) = open_read(app)?;
    list_ai_snapshots(&conn, kind.as_deref())
}

#[cfg(not(test))]
pub fn save_ai_snapshot_for_app(
    app: &AppHandle,
    input: SaveAiSnapshotRequest,
) -> Result<AiSnapshot> {
    let (conn, _) = open(app)?;
    save_ai_snapshot(&conn, input)
}

#[cfg(not(test))]
pub fn delete_ai_snapshot_for_app(app: &AppHandle, id: i64) -> Result<()> {
    let (conn, _) = open(app)?;
    delete_ai_snapshot(&conn, id)
}

pub(super) fn normalize_ai_markdown_export(
    input: AiMarkdownExportRequest,
) -> Result<(String, String)> {
    let title = input.title.trim();
    if title.is_empty() || title.chars().count() > 160 {
        bail!("Name the AI Markdown export with no more than 160 characters")
    }
    let mut markdown = input.markdown.replace("\r\n", "\n").replace('\r', "\n");
    if markdown.trim().is_empty() {
        bail!("There is no AI content to export")
    }
    if markdown.len() > 1_000_000 {
        bail!("The AI Markdown export is too large")
    }
    if !markdown.ends_with('\n') {
        markdown.push('\n');
    }
    Ok((title.to_string(), markdown))
}

#[cfg(not(test))]
pub fn export_ai_markdown_for_app(
    app: &AppHandle,
    input: AiMarkdownExportRequest,
) -> Result<ExportResult> {
    let (title, markdown) = normalize_ai_markdown_export(input)?;
    let (conn, _) = open_read(app)?;
    let export_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?
        .join("exports");
    fs::create_dir_all(&export_dir).context("Could not create export directory")?;
    let path = export_dir.join(format!(
        "music-library-ai-{}-{}.md",
        safe_file_segment(&title),
        Utc::now().format("%Y%m%d-%H%M%S")
    ));
    fs::write(&path, markdown.as_bytes())
        .with_context(|| format!("Could not write AI Markdown export {}", path.display()))?;
    let line_count = markdown.lines().count();
    let request_json = serde_json::to_string(&json!({
        "title": title,
        "characterCount": markdown.chars().count(),
        "byteCount": markdown.len()
    }))
    .context("Could not serialize the AI Markdown export record")?;
    conn.execute(
        "
        INSERT INTO exports (created_at, view, format, row_count, path, request_json)
        VALUES (?1, 'ai', 'md', ?2, ?3, ?4)
        ",
        params![
            Utc::now().to_rfc3339(),
            line_count as i64,
            path.display().to_string(),
            request_json
        ],
    )
    .context("Could not record the AI Markdown export")?;
    Ok(ExportResult {
        path: path.display().to_string(),
        format: "md".to_string(),
        row_count: line_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn saves_lists_and_deletes_typed_luna_snapshots() {
        let conn = seeded_connection();
        conn.execute(
            "
            UPDATE import_runs
            SET completed_at = '2026-07-16T10:00:00Z', track_rows = 10, album_count = 1
            WHERE id = 1
            ",
            [],
        )
        .expect("complete test import run");
        let result = crate::ai::AiCompiledQuery {
            target: "search".to_string(),
            query_intent: "filter".to_string(),
            summary: "Synthpop albums from 1987.".to_string(),
            request: BrowseRequest::default(),
            chart_config: None,
            model: "gpt-5.6-luna".to_string(),
            usage: crate::ai::AiUsage {
                input_tokens: Some(220),
                cached_input_tokens: Some(20),
                output_tokens: Some(55),
            },
        };
        let answer = crate::ai::AiCurrentViewAnswer {
            answer: "One matching album is fully rated.".to_string(),
            view: "albums".to_string(),
            matching_rows: 1,
            analysis_count: 1,
            named_rows_shared: 0,
            model: "gpt-5.6-luna".to_string(),
            usage: crate::ai::AiUsage {
                input_tokens: Some(300),
                cached_input_tokens: Some(0),
                output_tokens: Some(40),
            },
        };

        let saved = save_ai_snapshot(
            &conn,
            SaveAiSnapshotRequest {
                title: "1987 Synthpop".to_string(),
                content: AiSnapshotContent::Search {
                    prompt: "Synthpop albums from 1987".to_string(),
                    result: result.clone(),
                    answer: Some(answer.clone()),
                    exchanges: vec![crate::ai::AiQueryExchange {
                        prompt: "Synthpop albums from 1987".to_string(),
                        result,
                        answer: Some(answer),
                    }],
                },
            },
        )
        .expect("save Luna snapshot");

        assert_eq!(saved.title, "1987 Synthpop");
        assert_eq!(saved.library_import_run_id, Some(1));
        assert_eq!(
            saved.library_imported_at.as_deref(),
            Some("2026-07-16T10:00:00Z")
        );
        assert_eq!(saved.library_album_count, 1);
        assert_eq!(saved.library_track_count, 10);
        match &saved.content {
            AiSnapshotContent::Search {
                prompt,
                result,
                answer,
                exchanges,
            } => {
                assert_eq!(prompt, "Synthpop albums from 1987");
                assert_eq!(result.summary, "Synthpop albums from 1987.");
                assert_eq!(
                    answer.as_ref().map(|value| value.answer.as_str()),
                    Some("One matching album is fully rated.")
                );
                assert_eq!(exchanges.len(), 1);
                assert_eq!(exchanges[0].prompt, "Synthpop albums from 1987");
            }
            _ => panic!("expected a search snapshot"),
        }

        assert_eq!(list_ai_snapshots(&conn, Some("search")).unwrap().len(), 1);
        assert!(list_ai_snapshots(&conn, Some("chart")).unwrap().is_empty());

        let saved_answer = save_ai_snapshot(
            &conn,
            SaveAiSnapshotRequest {
                title: "How many albums?".to_string(),
                content: AiSnapshotContent::SearchAnswer {
                    prompt: "How many albums?".to_string(),
                    request: BrowseRequest::default(),
                    result: crate::ai::AiCurrentViewAnswer {
                        answer: "The filtered view contains one album.".to_string(),
                        view: "albums".to_string(),
                        matching_rows: 1,
                        analysis_count: 1,
                        named_rows_shared: 0,
                        model: "gpt-5.6-luna".to_string(),
                        usage: crate::ai::AiUsage {
                            input_tokens: Some(300),
                            cached_input_tokens: None,
                            output_tokens: Some(45),
                        },
                    },
                },
            },
        )
        .expect("save current-view answer snapshot");
        assert_eq!(
            list_ai_snapshots(&conn, Some("searchAnswer"))
                .unwrap()
                .len(),
            1
        );

        let saved_research = save_ai_snapshot(
            &conn,
            SaveAiSnapshotRequest {
                title: "How did Industrial Metal develop?".to_string(),
                content: AiSnapshotContent::MusicResearch {
                    prompt: "How did Industrial Metal develop?".to_string(),
                    context: crate::ai::AiMusicResearchContext {
                        workspace: "Genres".to_string(),
                        selected_entity_type: Some("genre".to_string()),
                        selected_entity_id: Some("industrial metal".to_string()),
                        selected_label: Some("Industrial Metal".to_string()),
                        selected_subtitle: Some("67 albums in your library".to_string()),
                    },
                    exchanges: vec![crate::ai::AiMusicResearchExchange {
                        question: "How did Industrial Metal develop?".to_string(),
                        result: crate::ai::AiMusicResearchAnswer {
                            answer: "## Foundations\n\nIndustrial music and heavy metal converged gradually."
                                .to_string(),
                            sources: vec![crate::ai::AiMusicResearchSource {
                                title: "Research source".to_string(),
                                url: "https://example.com/industrial-metal".to_string(),
                            }],
                            model: "gpt-5.6-luna".to_string(),
                            usage: crate::ai::AiUsage {
                                input_tokens: Some(620),
                                cached_input_tokens: Some(80),
                                output_tokens: Some(240),
                            },
                            used_web_search: true,
                            local_inspection_count: 20,
                        },
                    }],
                },
            },
        )
        .expect("save music research snapshot");
        assert_eq!(
            list_ai_snapshots(&conn, Some("musicResearch"))
                .unwrap()
                .len(),
            1
        );
        match &saved_research.content {
            AiSnapshotContent::MusicResearch {
                context, exchanges, ..
            } => {
                assert_eq!(context.selected_label.as_deref(), Some("Industrial Metal"));
                assert_eq!(exchanges.len(), 1);
                assert!(exchanges[0].result.answer.starts_with("## Foundations"));
                assert_eq!(exchanges[0].result.sources.len(), 1);
            }
            _ => panic!("expected a music research snapshot"),
        }

        delete_ai_snapshot(&conn, saved.id).expect("delete Luna snapshot");
        delete_ai_snapshot(&conn, saved_answer.id).expect("delete Luna answer snapshot");
        delete_ai_snapshot(&conn, saved_research.id).expect("delete music research snapshot");
        assert!(list_ai_snapshots(&conn, None).unwrap().is_empty());
    }

    #[test]
    fn normalizes_and_bounds_ai_markdown_exports() {
        let (title, markdown) = normalize_ai_markdown_export(AiMarkdownExportRequest {
            title: "  Industrial Metal research  ".to_string(),
            markdown: "# Industrial Metal\r\n\r\nA saved answer.".to_string(),
        })
        .expect("normalize Markdown export");
        assert_eq!(title, "Industrial Metal research");
        assert_eq!(markdown, "# Industrial Metal\n\nA saved answer.\n");

        assert!(normalize_ai_markdown_export(AiMarkdownExportRequest {
            title: "Empty".to_string(),
            markdown: "   ".to_string(),
        })
        .is_err());
        assert!(normalize_ai_markdown_export(AiMarkdownExportRequest {
            title: "Too large".to_string(),
            markdown: "x".repeat(1_000_001),
        })
        .is_err());
    }
}
